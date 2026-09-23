import { assertCardDeletionAllowsPath, readCardDeletion } from "./cardDeletionReceipt";
import { assertCardIdRepairAllowsCard, assertCardIdRepairAllowsPath, getReservedCardRepairIds } from "./cardIdRepairReceipt";
import { assertConceptIdRepairAllowsConcept, assertConceptIdRepairAllowsPath, getReservedConceptRepairIds, readConceptIdRepairs } from "./conceptIdRepairReceipt";
import { assertConceptNotDeleting, readConceptDeletions } from "./conceptDeletionReceipt";
import type { ConceptSummary } from "../models/conceptLibrary";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { ApprovedWriteReceipt, MarkdownWriteDraft, MarkdownWriteResult } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import type { ConceptSourceLink } from "../models/conceptSource";
import { computeContentHash } from "../utils/sourceHash";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { proposalWriteHash, readApprovedWriteReceipt, writtenContentHash } from "./approvedWriteRecovery";
import { MarkdownWriteConflict } from "./markdownWriteTransaction";
import {
	buildCardGroupPath,
	ensureUniquePath,
	normalizeVaultPath,
	toObsidianInternalLink,
} from "../utils/markdownPath";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	buildConceptUpdateSourceLinks,
	buildExistingConceptSourceLink,
	buildViewSourceLink,
	mergeLinkedConceptId,
} from "./conceptSourceLinking";
import { renderMarkdownProposal } from "./markdownProposalRenderer";
import { appendConceptView } from "./conceptViewAppender";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import { updateConceptSections } from "./conceptSectionUpdater";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";
import { appendCardGroupDraft } from "./cardGroupWriter";
import { parseMnemeCards } from "./cardMarkerParser";
import {
	findConceptNameConflict,
	type ConceptNameConflict,
} from "./conceptNameConflict";
import { createRandomCardId, createRandomConceptId } from "./entityId";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import { assertIncomingMergeAllowsOrigin, assertIncomingMergeAllowsTarget } from "./incomingConceptMergeRecovery";

export interface MnemeVaultAdapter {
	append(path: string, content: string): Promise<void>;
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	modify(path: string, content: string): Promise<void>;
	process(path: string, transform: (current: string) => string): Promise<void>;
	read(path: string): Promise<string>;
}

export interface ConceptSummaryScanner {
	scanConcepts(): Promise<ConceptSummary[]>;
}

export interface ApprovedProposalWriterOptions {
	storage: PluginDataStorage;
	cardIdFactory?: () => string;
	conceptIdFactory?: () => string;
	conceptScanner?: ConceptSummaryScanner;
	isCardIdReserved?(cardId: string): Promise<boolean>;
	isConceptIdReserved?(conceptId: string): Promise<boolean>;
	now?: () => string;
	settingsProvider: () => MnemeSettings;
	vaultAdapter: MnemeVaultAdapter;
}

interface PreparedApprovedWrite {
	before?: string;
	draft: MarkdownWriteDraft;
	entityId?: string;
}

export class ApprovedProposalWriter {
	private readonly now: () => string;

	constructor(private readonly options: ApprovedProposalWriterOptions) {
		this.now = options.now ?? (() => new Date().toISOString());
	}

	async findNewConceptNameConflict(proposalId: string): Promise<ConceptNameConflict | undefined> {
		const proposal = (normalizePluginData(await this.options.storage.loadData())).knowledgeProposals[proposalId];
		if (
			proposal?.kind !== "new_concept"
			|| !proposal.payload
			|| !this.options.conceptScanner
		) {
			return undefined;
		}

		return findConceptNameConflict(
			{
				coreMeaning: proposal.payload.coreMeaning,
				englishName: proposal.payload.englishName,
				title: proposal.payload.title,
			},
			this.options.settingsProvider(),
			await this.options.conceptScanner.scanConcepts(),
		);
	}

	async writeApprovedProposal(proposalId: string): Promise<MarkdownWriteResult> {
		return runPluginDataMutation(this.options.storage, async () => {
			let targetPaths: string[] = [];
			try {
				let data = normalizePluginData(await this.options.storage.loadData());
				let proposal = data.knowledgeProposals[proposalId];
				if (!proposal) return this.failedResult(proposalId, `Proposal not found: ${proposalId}`);
				assertIncomingMergeAllowsOrigin(data, { kind: "inbox", proposalId });
				let receipt = proposal.writeReceipt === undefined ? undefined : readApprovedWriteReceipt(proposal.writeReceipt);
				if (receipt) targetPaths = [receipt.targetPath];
				if (proposal.status === "written" && receipt) return this.writtenResult(proposalId, targetPaths);
				if (proposal.status !== "approved") {
					return { message: "Approve the proposal before writing Markdown.", proposalId, status: "skipped", targetPaths };
				}
				if (!["new_concept", "new_card", "update_concept", "link_existing_concept", "add_view"].includes(proposal.kind)) {
					return { message: `Proposal kind is not supported for Markdown writing yet: ${proposal.kind}`, proposalId, status: "skipped", targetPaths };
				}
				assertConceptNotDeleting(data.conceptDeletions, proposal.conceptId ?? "");
				assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, proposal.conceptId ?? "");
				const targetConceptId = proposal.kind === "link_existing_concept" ? proposal.payload?.targetConceptId
					: proposal.payload && "conceptId" in proposal.payload ? proposal.payload.conceptId : undefined;
				assertIncomingMergeAllowsTarget(data, receipt ? [receipt.targetPath] : [],
					[proposal.conceptId, targetConceptId].filter((id): id is string => !!id));
				if (targetConceptId) assertConceptNotDeleting(data.conceptDeletions, targetConceptId);
				if (targetConceptId) assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, targetConceptId);
				// A shared old ID becoming unique does not establish an older proposal's target.
				// Existing write receipts already bind a path and hashes; leave their recovery checks intact.
				const requiredConceptPath = receipt ? undefined : this.requireRepairedProposalTarget(
					proposal, targetConceptId, data.conceptIdRepairs,
				);
				if (receipt?.mode === "create" && receipt.entityId) assertConceptNotDeleting(data.conceptDeletions, receipt.entityId);
				const cardDeletion = readCardDeletion(data.cardDeletion);
				if (receipt) assertCardDeletionAllowsPath(data.cardDeletion, receipt.targetPath);
				if (receipt) assertCardIdRepairAllowsPath(data.cardIdRepairs, receipt.targetPath);
				if (receipt) assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt.targetPath);
				const validation = validateKnowledgeProposalPayload(proposal);
				if (!validation.valid) return this.failedResult(proposalId, validation.errors.join(" "));
				const proposalHash = await proposalWriteHash(proposal);
				const expectedMode = proposal.kind === "new_concept" ? "create" : proposal.kind === "new_card" ? "upsert_card_group" : "modify";
				if (receipt && (receipt.proposalHash !== proposalHash || receipt.mode !== expectedMode)) {
					throw new Error("The proposal changed after its write started. Restore the approved proposal before retrying completion.");
				}

				if (!receipt || !(await this.isWriteApplied(receipt))) {
					const manualCardWrite = !receipt && data.manualCardWrite !== undefined
						? readManualCardWriteReceipt(data.manualCardWrite)
						: undefined;
					const manualConceptWrite = !receipt && data.manualConceptWrite !== undefined
						? readManualConceptWriteReceipt(data.manualConceptWrite)
						: undefined;
					const reservedIds = new Set(Object.values(data.knowledgeProposals)
						.filter((other) => other.id !== proposalId && other.writeReceipt?.mode === expectedMode)
						.flatMap((other) => typeof other.writeReceipt?.entityId === "string" ? [other.writeReceipt.entityId] : []));
					if (expectedMode === "create") {
						for (const id of getReservedConceptRepairIds(data.conceptIdRepairs)) reservedIds.add(id);
						for (const id of Object.keys(readConceptDeletions(data.conceptDeletions))) reservedIds.add(id);
					}
					if (expectedMode === "upsert_card_group") {
						for (const id of getReservedCardRepairIds(data.cardIdRepairs)) reservedIds.add(id);
						for (const id of Object.keys(data.cardTombstones)) reservedIds.add(id);
						if (cardDeletion) reservedIds.add(cardDeletion.cardId);
					}
					if (manualCardWrite) reservedIds.add(manualCardWrite.cardId);
					if (manualConceptWrite && expectedMode === "create") reservedIds.add(manualConceptWrite.conceptId);
					const reservedPaths = new Set(Object.values(data.knowledgeProposals)
						.filter((other) => other.id !== proposalId && other.writeReceipt?.mode === "create")
						.flatMap((other) => typeof other.writeReceipt?.targetPath === "string" ? [other.writeReceipt.targetPath] : []));
					if (manualConceptWrite && expectedMode === "create") reservedPaths.add(manualConceptWrite.path);
					if (expectedMode === "create") {
						for (const id of getReservedConceptRepairIds(data.conceptIdRepairs)) reservedIds.add(id);
						for (const deletion of Object.values(readConceptDeletions(data.conceptDeletions))) {
							if (deletion.status === "pending") for (const file of deletion.files) reservedPaths.add(file.path);
						}
					}
					const plan = await this.prepareWrite(proposal, receipt, reservedIds, reservedPaths, requiredConceptPath);
					assertIncomingMergeAllowsTarget(data, [plan.draft.targetPath], plan.entityId ? [plan.entityId] : []);
					assertCardDeletionAllowsPath(data.cardDeletion, plan.draft.targetPath);
					assertCardIdRepairAllowsPath(data.cardIdRepairs, plan.draft.targetPath);
					assertConceptIdRepairAllowsPath(data.conceptIdRepairs, plan.draft.targetPath);
					if (expectedMode === "upsert_card_group" && plan.entityId) assertCardIdRepairAllowsCard(data.cardIdRepairs, plan.entityId);
					if (expectedMode === "create" && plan.entityId) assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, plan.entityId);
					const afterHash = await writtenContentHash(plan.draft.mode as ApprovedWriteReceipt["mode"], plan.draft.content, plan.entityId);
					if (!afterHash) throw new Error("The planned Card has no valid identity.");
					if (receipt) {
						if (receipt.afterHash !== afterHash || receipt.targetPath !== plan.draft.targetPath) {
							throw new Error("The write target or rendering settings changed. Restore them before retrying completion.");
						}
					} else {
						receipt = {
							version: 1, proposalHash, targetPath: plan.draft.targetPath,
							mode: expectedMode, entityId: plan.entityId,
							...(plan.before !== undefined ? { beforeHash: await computeContentHash(plan.before) } : {}),
							afterHash, createdAt: this.now(),
						};
						proposal = { ...proposal, writeReceipt: receipt };
						data = { ...data, knowledgeProposals: { ...data.knowledgeProposals, [proposalId]: proposal } };
						// This must succeed before any Markdown write. A restart can then reuse the exact intent.
						await this.options.storage.saveData(data);
					}
					targetPaths = [receipt.targetPath];
					await this.ensureParentFolders(receipt.targetPath);
					if (plan.before !== undefined) {
						await this.options.vaultAdapter.process(plan.draft.targetPath, (current) => {
							if (current !== plan.before) throw new MarkdownWriteConflict(plan.draft.targetPath);
							return plan.draft.content;
						});
					} else {
						await this.writeDraft(plan.draft);
					}
				}
				if (!receipt) throw new Error("The approved write has no recovery record.");

				const conceptSourceLinks = { ...data.conceptSourceLinks };
				const sourceAnalysisRecords = { ...data.sourceAnalysisRecords };
				for (const link of this.sourceLinksFor(proposal, receipt.entityId, receipt.createdAt)) {
					conceptSourceLinks[link.id] = link;
					const record = sourceAnalysisRecords[link.sourcePath];
					if (record) sourceAnalysisRecords[link.sourcePath] = mergeLinkedConceptId(record, link.conceptId);
				}
				// One state commit completes provenance and the proposal together. A failed/uncertain
				// save retains the pre-write receipt; recovery checks Markdown instead of overwriting it.
				await this.options.storage.saveData({
					...data, conceptSourceLinks, sourceAnalysisRecords,
					knowledgeProposals: { ...data.knowledgeProposals, [proposalId]: { ...proposal, payload: undefined, status: "written", updatedAt: this.now() } },
				});
				return this.writtenResult(proposalId, targetPaths);
			} catch (error) {
				return { message: error instanceof Error ? error.message : "Markdown write failed.", proposalId, status: "failed", targetPaths };
			}
		});
	}

	private writtenResult(proposalId: string, targetPaths: string[]): MarkdownWriteResult {
		return { message: "Markdown written.", proposalId, status: "written", targetPaths };
	}

	private async isWriteApplied(receipt: ApprovedWriteReceipt): Promise<boolean> {
		if (!(await this.options.vaultAdapter.exists(receipt.targetPath))) {
			if (receipt.mode === "modify") throw new Error(`The recovery target is missing: ${receipt.targetPath}`);
			return false;
		}
		const current = await this.options.vaultAdapter.read(receipt.targetPath);
		const hash = await writtenContentHash(receipt.mode, current, receipt.entityId);
		if (hash === receipt.afterHash) return true;
		if (receipt.mode === "upsert_card_group" && hash === undefined) return false;
		if (receipt.mode === "modify" && hash === receipt.beforeHash) return false;
		throw new Error(`${receipt.targetPath} changed after the write started. Existing content was preserved; resolve the conflict before retrying completion.`);
	}

	private requireRepairedProposalTarget(proposal: KnowledgeProposal, conceptId: string | undefined, repairs: unknown): string | undefined {
		if (!conceptId) return undefined;
		const duplicateRepairs = Object.values(readConceptIdRepairs(repairs))
			.filter((repair) => repair.status === "completed" && repair.oldConceptId === conceptId);
		if (duplicateRepairs.length === 0) return undefined;
		// For generated Cards, sourcePath is the Concept that supplied the learning content.
		// Other proposal kinds use Source Notes here, so their paths cannot prove target identity.
		const sourcePath = proposal.kind === "new_card" && proposal.sourcePath
			? normalizeVaultPath(proposal.sourcePath) : undefined;
		if (!sourcePath || duplicateRepairs.some((repair) => normalizeVaultPath(repair.concept.path) === sourcePath)) {
			throw new Error("The target Concept ID was duplicated and repaired. This proposal's target is ambiguous. Its text was preserved; recreate it from the intended Concept.");
		}
		return sourcePath;
	}

	private async prepareWrite(proposal: KnowledgeProposal, receipt: ApprovedWriteReceipt | undefined, reservedIds: ReadonlySet<string>, reservedPaths: ReadonlySet<string>, requiredConceptPath?: string): Promise<PreparedApprovedWrite> {
		if (proposal.kind !== "new_concept" && proposal.kind !== "new_card") return this.prepareConceptChange(proposal, receipt);
		const renderResult = renderMarkdownProposal(proposal, this.options.settingsProvider(), {
			createCardId: receipt?.entityId ? () => receipt.entityId! : this.options.cardIdFactory,
			createConceptId: receipt?.entityId ? () => receipt.entityId! : this.options.conceptIdFactory,
		});
		if (renderResult.status !== "rendered") throw new Error(renderResult.message);
		let drafts = proposal.kind === "new_card"
			? await this.alignCardDraftWithConcept(renderResult.drafts, proposal.payload?.conceptId, requiredConceptPath)
			: renderResult.drafts;
		if (receipt) {
			drafts = drafts.map((draft) => ({ ...draft, targetPath: receipt.targetPath,
				content: proposal.kind === "new_card" ? replaceCardIdInDraft(draft.content, receipt.entityId!) : draft.content }));
		} else {
			drafts = await this.assignUniqueTargetPaths(drafts, reservedPaths);
			if (proposal.kind === "new_concept") drafts = await this.assignAvailableNewConceptIdentity(drafts, reservedIds);
			else drafts = await this.assignRandomCardIdsToCardDrafts(drafts, reservedIds);
		}
		if (proposal.kind === "new_concept" && proposal.payload) drafts = this.alignNewConceptDraftWithUniquePath(drafts, proposal.payload.title);
		const draft = drafts[0];
		if (drafts.length !== 1 || !draft) throw new Error("An approved write must have exactly one Markdown target.");
		const entityId = proposal.kind === "new_concept" ? this.extractConceptIdFromDrafts(drafts) : parseMnemeCards(draft.content)[0]?.explicitCardId;
		if (!entityId) throw new Error("The approved write has no valid identity.");
		const reserved = proposal.kind === "new_concept" ? this.options.isConceptIdReserved : this.options.isCardIdReserved;
		if (reservedIds.has(entityId) || await reserved?.(entityId)) throw new Error(`The saved identity is already active or reserved: ${entityId}`);
		return { draft, entityId };
	}

	private async assignAvailableNewConceptIdentity(
		drafts: MarkdownWriteDraft[],
		reservedIds: ReadonlySet<string>,
	): Promise<MarkdownWriteDraft[]> {
		const currentId = this.extractConceptIdFromDrafts(drafts);
		if (!currentId || (!reservedIds.has(currentId) && !(await this.options.isConceptIdReserved?.(currentId)))) return drafts;

		const createConceptId = this.options.conceptIdFactory ?? createRandomConceptId;
		for (let attempt = 0; attempt < 128; attempt += 1) {
			const candidateId = createConceptId();
			if (reservedIds.has(candidateId) || await this.options.isConceptIdReserved?.(candidateId)) continue;

			return drafts.map((draft) => draft.kind === "concept"
				? {
					...draft,
					content: draft.content.replace(/^mneme_id:\s*.*$/m, `mneme_id: ${candidateId}`),
				}
				: draft);
		}

		throw new Error("No available random Concept ID could be allocated.");
	}

	private async prepareConceptChange(proposal: KnowledgeProposal, receipt?: ApprovedWriteReceipt): Promise<PreparedApprovedWrite> {
		const now = receipt?.createdAt ?? this.now();
		let conceptId: string | undefined;
		if (proposal.kind === "update_concept" || proposal.kind === "add_view") conceptId = proposal.payload?.conceptId;
		if (proposal.kind === "link_existing_concept") conceptId = proposal.payload?.targetConceptId;
		if (!conceptId) throw new Error("The proposal has no target Concept.");
		const targetPath = await this.resolveConceptPath(conceptId);
		if (receipt && receipt.targetPath !== targetPath) throw new Error("The Concept moved after the write started. Restore its location before retrying.");
		const before = await this.options.vaultAdapter.read(targetPath);
		if (receipt && await computeContentHash(before) !== receipt.beforeHash) throw new MarkdownWriteConflict(targetPath);
		let content = before;
		if (proposal.kind === "update_concept" && proposal.payload) {
			const payload = proposal.payload;
			if (payload.proposedCoreMeaning?.trim() || payload.proposedWhyItMatters?.trim()) {
				content = updateConceptSections(content, { coreMeaning: payload.proposedCoreMeaning?.trim() || undefined, whyItMatters: payload.proposedWhyItMatters?.trim() || undefined }).markdown;
			}
			for (const view of payload.proposedViews ?? []) content = appendConceptView(content, view).markdown;
		}
		if (proposal.kind === "add_view" && proposal.payload) content = appendConceptView(content, proposal.payload.view).markdown;
		for (const link of this.sourceLinksFor(proposal, undefined, now)) content = appendConceptSourceNote(content, link).markdown;
		return { before, draft: { content, kind: "concept", mode: "modify", sourceProposalId: proposal.id, targetPath } };
	}

	private async resolveConceptPath(conceptId: string): Promise<string> {
		return (await this.resolveConceptSummary(conceptId)).path;
	}

	private async resolveConceptSummary(conceptId: string): Promise<ConceptSummary> {
		if (!this.options.conceptScanner) {
			throw new Error("Concept lookup is unavailable.");
		}

		const concepts = await this.options.conceptScanner.scanConcepts();
		const matches = concepts.filter((concept) => concept.conceptId === conceptId);

		if (matches.length === 0) {
			throw new Error(`Concept not found: ${conceptId}`);
		}

		if (matches.length > 1) {
			throw new Error(`Multiple Concept files use id: ${conceptId}`);
		}

		const targetConcept = matches[0];

		if (!targetConcept) {
			throw new Error(`Concept not found: ${conceptId}`);
		}

		return targetConcept;
	}

	private async alignCardDraftWithConcept(
		drafts: MarkdownWriteDraft[],
		conceptId: string | undefined,
		requiredConceptPath?: string,
	): Promise<MarkdownWriteDraft[]> {
		if (!this.options.conceptScanner || !conceptId) {
			if (requiredConceptPath) throw new Error("The target Concept ID was duplicated and repaired. Concept lookup is required to verify this Card proposal's target.");
			return drafts;
		}

		const concept = await this.resolveConceptSummary(conceptId);
		if (requiredConceptPath && normalizeVaultPath(concept.path) !== requiredConceptPath) {
			throw new Error("The target Concept ID was duplicated and repaired. This Card proposal belongs to a different Concept path. Its text was preserved; regenerate it from the intended Concept.");
		}
		const declaredCardsPath = concept.cardsPath
			? normalizeVaultPath(concept.cardsPath)
			: undefined;
		const cardGroupPath = declaredCardsPath
			? /\.md$/i.test(declaredCardsPath)
				? /(?:^|\/)Card\.md$/i.test(declaredCardsPath)
					? declaredCardsPath.replace(/Card\.md$/i, "Cards.md")
					: declaredCardsPath
				: `${declaredCardsPath}/Cards.md`
			: undefined;
		const conceptLink = toObsidianInternalLink(concept.path, concept.title);

		return drafts.map((draft) => draft.mode !== "upsert_card_group"
			? draft
			: {
				...draft,
				content: draft.content
					.replace(/^concept:\s*.*$/m, `concept: "${escapeYamlDoubleQuoted(conceptLink)}"`)
					.replace(/^# .* Cards$/m, `# ${concept.title} Cards`),
				targetPath: cardGroupPath ?? draft.targetPath,
			});
	}

	private alignNewConceptDraftWithUniquePath(
		drafts: MarkdownWriteDraft[],
		conceptTitle: string,
	): MarkdownWriteDraft[] {
		return drafts.map((draft) => {
			if (draft.kind !== "concept") return draft;
			const stem = normalizeVaultPath(draft.targetPath).split("/").pop()?.replace(/\.md$/i, "") ?? conceptTitle;
			const displayTitle = draft.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || conceptTitle;
			const cardGroupPath = buildCardGroupPath(this.options.settingsProvider().cardsFolder, stem);
			const cardGroupLink = toObsidianInternalLink(cardGroupPath, `${displayTitle} Cards`);
			return {
				...draft,
				content: draft.content
					.replace(/^cards:\s*.*$/m, `cards: "${escapeYamlDoubleQuoted(cardGroupLink)}"`)
					.replace(/^Cards:\s*.*$/m, `Cards: ${cardGroupLink}`),
			};
		});
	}

	private async assignRandomCardIdsToCardDrafts(drafts: MarkdownWriteDraft[], reservedReceiptIds: ReadonlySet<string>): Promise<MarkdownWriteDraft[]> {
		const reservedByTarget = new Map<string, Set<string>>();
		const assignedDrafts: MarkdownWriteDraft[] = [];

		for (const draft of drafts) {
			if (draft.mode !== "upsert_card_group") {
				assignedDrafts.push(draft);
				continue;
			}

			const targetPath = normalizeVaultPath(draft.targetPath);
			let reservedIds = reservedByTarget.get(targetPath);

			if (!reservedIds) {
				reservedIds = new Set(reservedReceiptIds);
				if (await this.options.vaultAdapter.exists(targetPath)) {
					for (const card of parseMnemeCards(await this.options.vaultAdapter.read(targetPath))) {
						if (card.explicitCardId) {
							reservedIds.add(card.explicitCardId);
						}
					}
				}
				reservedByTarget.set(targetPath, reservedIds);
			}

			const draftCards = parseMnemeCards(draft.content);
			const draftCard = draftCards.length === 1 ? draftCards[0] : undefined;

			if (!draftCard?.isValid) {
				assignedDrafts.push(draft);
				continue;
			}

			const createCardId = this.options.cardIdFactory ?? createRandomCardId;
			let cardId = draftCard.explicitCardId ?? createCardId();
			let attempts = 0;
			while (
				(reservedIds.has(cardId) || await this.options.isCardIdReserved?.(cardId) === true)
				&& attempts < 128
			) {
				cardId = createCardId();
				attempts += 1;
			}
			if (reservedIds.has(cardId) || await this.options.isCardIdReserved?.(cardId) === true) {
				throw new Error("Unable to allocate a unique random Card ID.");
			}
			reservedIds.add(cardId);

			assignedDrafts.push({
				...draft,
				content: replaceCardIdInDraft(draft.content, cardId),
				targetPath,
			});
		}

		return assignedDrafts;
	}

	private extractConceptIdFromDrafts(drafts: MarkdownWriteDraft[]): string | undefined {
		for (const draft of drafts) {
			if (draft.kind !== "concept") continue;
			const match = draft.content.match(/^mneme_id:\s*(.+)$/m);
			const conceptId = match?.[1]?.trim();

			if (conceptId) {
				return conceptId.replace(/^['"]|['"]$/g, "");
			}
		}

		return undefined;
	}

	private failedResult(proposalId: string, message: string): MarkdownWriteResult {
		return {
			message,
			proposalId,
			status: "failed",
			targetPaths: [],
		};
	}

	private async assignUniqueTargetPaths(drafts: MarkdownWriteDraft[], receiptPaths: ReadonlySet<string>): Promise<MarkdownWriteDraft[]> {
		const reservedPaths = new Set(receiptPaths);
		const assignedDrafts: MarkdownWriteDraft[] = [];

		for (const draft of drafts) {
			const desiredPath = normalizeVaultPath(draft.targetPath);
			if (draft.mode === "upsert_card_group") {
				reservedPaths.add(desiredPath);
				assignedDrafts.push({ ...draft, targetPath: desiredPath });
				continue;
			}
			const occupiedPaths = new Set(reservedPaths);
			let candidate = desiredPath;

			while (reservedPaths.has(candidate) || await this.options.vaultAdapter.exists(candidate)) {
				occupiedPaths.add(candidate);
				candidate = ensureUniquePath(occupiedPaths, desiredPath);
			}

			reservedPaths.add(candidate);
			assignedDrafts.push({
				...draft,
				targetPath: candidate,
			});
		}

		return assignedDrafts;
	}

	private async ensureParentFolders(path: string): Promise<void> {
		const parts = normalizeVaultPath(path).split("/");

		parts.pop();

		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!(await this.options.vaultAdapter.exists(currentPath))) {
				await this.options.vaultAdapter.createFolder(currentPath);
			}
		}
	}

	private async writeDraft(draft: MarkdownWriteDraft): Promise<void> {
		if (draft.mode === "upsert_card_group") {
			if (!(await this.options.vaultAdapter.exists(draft.targetPath))) {
				await this.options.vaultAdapter.create(draft.targetPath, draft.content);
				return;
			}

			await this.options.vaultAdapter.process(draft.targetPath, (current) => {
				const appendResult = appendCardGroupDraft(current, draft.content);
				if (appendResult.status === "invalid") throw new Error(appendResult.message);
				return appendResult.markdown;
			});
			return;
		}

		if (draft.mode === "append") {
			await this.options.vaultAdapter.append(draft.targetPath, draft.content);
			return;
		}

		if (draft.mode === "modify") {
			throw new Error("Modify mode is not supported yet.");
		}

		await this.options.vaultAdapter.create(draft.targetPath, draft.content);
	}

	private sourceLinksFor(proposal: KnowledgeProposal, conceptId: string | undefined, now: string): ConceptSourceLink[] {
		if (proposal.kind === "new_concept" && conceptId) return buildConceptSourceLinksFromNewConceptProposal({ conceptId, now, proposal });
		if (proposal.kind === "update_concept") return buildConceptUpdateSourceLinks({ now, proposal });
		const link = proposal.kind === "link_existing_concept" ? buildExistingConceptSourceLink({ now, proposal })
			: proposal.kind === "add_view" ? buildViewSourceLink({ now, proposal }) : undefined;
		return link ? [link] : [];
	}

}

function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function replaceCardIdInDraft(markdown: string, cardId: string): string {
	return markdown.replace(
		/(<!--\s*MNEME:CARD:start\b)([^>]*)(-->)/,
		(_marker, prefix: string, rawAttributes: string) => {
			const attributes = rawAttributes
				.replace(/\bid\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, " ")
				.trim()
				.replace(/\s+/gu, " ");

			return `${prefix} id="${cardId}"${attributes ? ` ${attributes}` : ""} -->`;
		},
	);
}
