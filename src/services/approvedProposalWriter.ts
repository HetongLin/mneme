import type { ConceptSummary } from "../models/conceptLibrary";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { MarkdownWriteDraft, MarkdownWriteResult } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import { buildCardGroupPath, ensureUniquePath, normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	buildConceptUpdateSourceLinks,
	buildExistingConceptSourceLink,
	buildViewSourceLink,
	mergeLinkedConceptId,
	normalizeConceptIdForWrittenConcept,
} from "./conceptSourceLinking";
import { ConceptSourceLinkStore } from "./conceptSourceLinkStore";
import { KnowledgeProposalStore } from "./knowledgeProposalStore";
import { renderMarkdownProposal } from "./markdownProposalRenderer";
import { SourceAnalysisStore } from "./sourceAnalysisStore";
import { appendConceptView } from "./conceptViewAppender";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import { updateConceptSections } from "./conceptSectionUpdater";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";
import { appendCardGroupDraft } from "./cardGroupWriter";

export interface MnemeVaultAdapter {
	append(path: string, content: string): Promise<void>;
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

export interface ConceptSummaryScanner {
	scanConcepts(): Promise<ConceptSummary[]>;
}

export interface ApprovedProposalWriterOptions {
	conceptSourceLinkStore?: ConceptSourceLinkStore;
	conceptScanner?: ConceptSummaryScanner;
	isConceptIdReserved?(conceptId: string): Promise<boolean>;
	now?: () => string;
	proposalStore: KnowledgeProposalStore;
	settingsProvider: () => MnemeSettings;
	sourceAnalysisStore?: SourceAnalysisStore;
	vaultAdapter: MnemeVaultAdapter;
}

export class ApprovedProposalWriter {
	private readonly now: () => string;

	constructor(private readonly options: ApprovedProposalWriterOptions) {
		this.now = options.now ?? (() => new Date().toISOString());
	}

	async writeApprovedProposal(proposalId: string): Promise<MarkdownWriteResult> {
		const proposal = await this.options.proposalStore.getProposal(proposalId);

		if (!proposal) {
			return {
				message: `Proposal not found: ${proposalId}`,
				proposalId,
				status: "failed",
				targetPaths: [],
			};
		}

		if (proposal.status !== "approved") {
			return {
				message: "Approve the proposal before writing Markdown.",
				proposalId,
				status: "skipped",
				targetPaths: [],
			};
		}

		if (proposal.kind === "link_existing_concept") {
			return this.writeExistingConceptLinkProposal(proposal);
		}

		if (proposal.kind === "update_concept") {
			return this.writeConceptUpdateProposal(proposal);
		}

		if (proposal.kind === "add_view") {
			return this.writeConceptViewProposal(proposal);
		}

		if (proposal.kind === "new_concept" && this.options.isConceptIdReserved) {
			const conceptId = normalizeConceptIdForWrittenConcept({ proposal, targetPaths: [] });
			try {
				if (await this.options.isConceptIdReserved(conceptId)) {
					return this.failedResult(proposal.id, `Concept ID is already active or reserved: ${conceptId}`);
				}
			} catch (error) {
				return this.failedResult(
					proposal.id,
					error instanceof Error ? error.message : "Concept identity lookup failed.",
				);
			}
		}

		const renderResult = renderMarkdownProposal(proposal, this.options.settingsProvider());

		if (renderResult.status !== "rendered") {
			return {
				message: renderResult.message,
				proposalId,
				status: renderResult.status === "unsupported" ? "skipped" : "failed",
				targetPaths: [],
			};
		}

		const targetPaths: string[] = [];

		try {
			const preparedDrafts = proposal.kind === "new_card"
				? await this.alignCardDraftWithConcept(renderResult.drafts, proposal.payload?.conceptId)
				: renderResult.drafts;
			const assignedDrafts = await this.assignUniqueTargetPaths(preparedDrafts);
			const drafts = proposal.kind === "new_concept" && proposal.payload
				? this.alignNewConceptDraftWithUniquePath(assignedDrafts, proposal.payload.title)
				: assignedDrafts;

			for (const draft of drafts) {
				await this.ensureParentFolders(draft.targetPath);
				await this.writeDraft(draft);
				targetPaths.push(draft.targetPath);
			}

			await this.indexConceptSourceLinksAfterWrite(proposal, targetPaths);
			await this.options.proposalStore.updateProposalStatus(proposalId, "written", this.now());

			return {
				message: "Markdown written.",
				proposalId,
				status: "written",
				targetPaths,
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Markdown write failed.",
				proposalId,
				status: "failed",
				targetPaths,
			};
		}
	}

	private async writeConceptUpdateProposal(
		proposal: Extract<KnowledgeProposal, { kind: "update_concept" }>,
	): Promise<MarkdownWriteResult> {
		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid || !proposal.payload) {
			return this.failedResult(proposal.id, validation.errors.join(" ") || "Concept update is invalid.");
		}

		if (!this.options.conceptScanner) {
			return {
				message: "Concept lookup is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		const payload = proposal.payload;
		const now = this.now();
		const sourceLinks = buildConceptUpdateSourceLinks({ now, proposal });

		if (sourceLinks.length > 0 && !this.options.conceptSourceLinkStore) {
			return {
				message: "Concept source linking is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		try {
			const targetPath = await this.resolveConceptPath(payload.conceptId);
			const originalMarkdown = await this.options.vaultAdapter.read(targetPath);
			let updatedMarkdown = originalMarkdown;

			if (payload.proposedCoreMeaning?.trim() || payload.proposedWhyItMatters?.trim()) {
				updatedMarkdown = updateConceptSections(updatedMarkdown, {
					coreMeaning: payload.proposedCoreMeaning?.trim() || undefined,
					whyItMatters: payload.proposedWhyItMatters?.trim() || undefined,
				}).markdown;
			}

			for (const view of payload.proposedViews ?? []) {
				updatedMarkdown = appendConceptView(updatedMarkdown, view).markdown;
			}

			for (const sourceLink of sourceLinks) {
				updatedMarkdown = appendConceptSourceNote(updatedMarkdown, sourceLink).markdown;
			}

			if (updatedMarkdown !== originalMarkdown) {
				await this.options.vaultAdapter.modify(targetPath, updatedMarkdown);
			}

			for (const sourceLink of sourceLinks) {
				await this.options.conceptSourceLinkStore?.upsertLink(sourceLink);
				const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(sourceLink.sourcePath);

				if (sourceRecord) {
					await this.options.sourceAnalysisStore?.upsertRecord(
						mergeLinkedConceptId(sourceRecord, payload.conceptId),
					);
				}
			}

			await this.options.proposalStore.updateProposalStatus(proposal.id, "written", now);

			return {
				message: updatedMarkdown === originalMarkdown
					? "Concept update already written."
					: "Concept updated.",
				proposalId: proposal.id,
				status: "written",
				targetPaths: [targetPath],
			};
		} catch (error) {
			return this.failedResult(
				proposal.id,
				error instanceof Error ? error.message : "Concept update failed.",
			);
		}
	}

	private async writeExistingConceptLinkProposal(
		proposal: Extract<KnowledgeProposal, { kind: "link_existing_concept" }>,
	): Promise<MarkdownWriteResult> {
		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid || !proposal.payload) {
			return this.failedResult(proposal.id, validation.errors.join(" ") || "Source link proposal is invalid.");
		}

		if (!this.options.conceptScanner || !this.options.conceptSourceLinkStore) {
			return {
				message: "Concept source linking is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		const payload = proposal.payload;

		try {
			const targetPath = await this.resolveConceptPath(payload.targetConceptId);
			const markdown = await this.options.vaultAdapter.read(targetPath);
			const appendResult = appendConceptSourceNote(markdown, payload.proposedSourceLink);

			if (appendResult.status === "appended") {
				await this.options.vaultAdapter.modify(targetPath, appendResult.markdown);
			}

			const now = this.now();
			const sourceLink = buildExistingConceptSourceLink({ now, proposal });

			if (!sourceLink) {
				throw new Error("Source link proposal is invalid.");
			}

			await this.options.conceptSourceLinkStore.upsertLink(sourceLink);
			const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(sourceLink.sourcePath);

			if (sourceRecord) {
				await this.options.sourceAnalysisStore?.upsertRecord(
					mergeLinkedConceptId(sourceRecord, payload.targetConceptId),
				);
			}

			await this.options.proposalStore.updateProposalStatus(proposal.id, "written", now);

			return {
				message: appendResult.status === "unchanged"
					? "Concept source link already written."
					: "Concept source link written.",
				proposalId: proposal.id,
				status: "written",
				targetPaths: [targetPath],
			};
		} catch (error) {
			return this.failedResult(
				proposal.id,
				error instanceof Error ? error.message : "Concept source link write failed.",
			);
		}
	}

	private async writeConceptViewProposal(
		proposal: Extract<KnowledgeProposal, { kind: "add_view" }>,
	): Promise<MarkdownWriteResult> {
		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid || !proposal.payload) {
			return {
				message: validation.errors.join(" ") || "Add view proposal payload is invalid.",
				proposalId: proposal.id,
				status: "failed",
				targetPaths: [],
			};
		}

		const payload = proposal.payload;
		const now = this.now();
		const sourceLink = buildViewSourceLink({ now, proposal });

		if (sourceLink && !this.options.conceptSourceLinkStore) {
			return {
				message: "Concept source linking is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		if (!this.options.conceptScanner) {
			return {
				message: "Concept lookup is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		try {
			const targetPath = await this.resolveConceptPath(payload.conceptId);
			const markdown = await this.options.vaultAdapter.read(targetPath);
			const viewResult = appendConceptView(markdown, payload.view);
			const sourceResult = sourceLink
				? appendConceptSourceNote(viewResult.markdown, sourceLink)
				: undefined;
			const updatedMarkdown = sourceResult?.markdown ?? viewResult.markdown;

			if (viewResult.status === "appended" || sourceResult?.status === "appended") {
				await this.options.vaultAdapter.modify(targetPath, updatedMarkdown);
			}

			if (sourceLink) {
				await this.options.conceptSourceLinkStore?.upsertLink(sourceLink);
				const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(sourceLink.sourcePath);

				if (sourceRecord) {
					await this.options.sourceAnalysisStore?.upsertRecord(
						mergeLinkedConceptId(sourceRecord, payload.conceptId),
					);
				}
			}

			await this.options.proposalStore.updateProposalStatus(proposal.id, "written", now);

			return {
				message: viewResult.status === "unchanged" && sourceResult?.status !== "appended"
					? "Concept view already written."
					: "Concept view written.",
				proposalId: proposal.id,
				status: "written",
				targetPaths: [targetPath],
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Concept view write failed.",
				proposalId: proposal.id,
				status: "failed",
				targetPaths: [],
			};
		}
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
	): Promise<MarkdownWriteDraft[]> {
		if (!this.options.conceptScanner || !conceptId) {
			return drafts;
		}

		const concept = await this.resolveConceptSummary(conceptId);
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
			const cardGroupPath = buildCardGroupPath(this.options.settingsProvider().cardsFolder, stem);
			const cardGroupLink = toObsidianInternalLink(cardGroupPath, `${conceptTitle} Cards`);
			return {
				...draft,
				content: draft.content
					.replace(/^cards:\s*.*$/m, `cards: "${escapeYamlDoubleQuoted(cardGroupLink)}"`)
					.replace(/^Cards:\s*.*$/m, `Cards: ${cardGroupLink}`),
			};
		});
	}

	private failedResult(proposalId: string, message: string): MarkdownWriteResult {
		return {
			message,
			proposalId,
			status: "failed",
			targetPaths: [],
		};
	}

	private async assignUniqueTargetPaths(drafts: MarkdownWriteDraft[]): Promise<MarkdownWriteDraft[]> {
		const reservedPaths = new Set<string>();
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

			const existing = await this.options.vaultAdapter.read(draft.targetPath);
			const appendResult = appendCardGroupDraft(existing, draft.content);
			if (appendResult.status === "invalid") {
				throw new Error(appendResult.message);
			}
			if (appendResult.status === "appended") {
				await this.options.vaultAdapter.modify(draft.targetPath, appendResult.markdown);
			}
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

	private async indexConceptSourceLinksAfterWrite(
		proposal: Awaited<ReturnType<KnowledgeProposalStore["getProposal"]>>,
		targetPaths: string[],
	): Promise<void> {
		if (
			!proposal
			|| proposal.kind !== "new_concept"
			|| !this.options.conceptSourceLinkStore
			|| !this.options.sourceAnalysisStore
		) {
			return;
		}

		const now = this.now();
		const conceptId = normalizeConceptIdForWrittenConcept({
			proposal,
			targetPaths,
		});
		const links = buildConceptSourceLinksFromNewConceptProposal({
			conceptId,
			now,
			proposal,
		});

		for (const link of links) {
			await this.options.conceptSourceLinkStore.upsertLink(link);
			const sourceRecord = await this.options.sourceAnalysisStore.getRecord(link.sourcePath);

			if (!sourceRecord) {
				continue;
			}

			await this.options.sourceAnalysisStore.upsertRecord(mergeLinkedConceptId(sourceRecord, conceptId));
		}
	}
}

function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
