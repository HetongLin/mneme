import { assertMergeHasNoPendingWrites } from "./mergePendingWrites";
import { assertCardRelocationSafe, type ResolveCardLink } from "./cardRelocationSafety";
import { assertMarkdownRelocationSafe } from "./markdownRelocationSafety";
import { readMarkdownScalar } from "./markdownScalar";
import { getCardGroupPathFromConceptFrontmatter } from "./conceptMarkdownIdentity";
import { assertCardDeletionAllowsPath } from "./cardDeletionReceipt";
import { assertCardIdRepairAllowsPath } from "./cardIdRepairReceipt";
import { assertConceptIdRepairAllowsConcept, assertConceptIdRepairAllowsPath } from "./conceptIdRepairReceipt";
import { assertConceptNotDeleting } from "./conceptDeletionReceipt";
import type { ConceptSummary } from "../models/conceptLibrary";
import type { ConceptSourceLink, SourceEvidence } from "../models/conceptSource";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type {
	ConceptDuplicateDismissal,
	MnemePluginData,
} from "../models/reviewState";
import { toObsidianInternalLink } from "../utils/markdownPath";
import { parseMnemeCards } from "./cardMarkerParser";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import { createConceptDuplicatePairKey } from "./conceptDuplicateDetector";
import { parseConceptTitle } from "./conceptMarkdownParser";
import {
	addRelatedConceptLink,
	comparableConceptPath,
	parseRelatedConceptLinks,
	removeRelatedConceptLink,
} from "./conceptRelatedLinks";
import { createConceptSourceLinkId } from "./conceptSourceLinking";
import { appendConceptView } from "./conceptViewAppender";
import { normalizePluginData } from "./reviewStateStore";
import { runPluginDataMutation } from "./pluginDataMutation";
import {
	executeMarkdownWriteTransaction,
	MarkdownWriteConflict,
	type TransactionalMarkdownVault,
} from "./markdownWriteTransaction";

export interface ConceptMergeVaultAdapter extends TransactionalMarkdownVault {
	resolveLinkpath?: ResolveCardLink;
	exists(path: string): Promise<boolean>;
	listMarkdownFiles(): Promise<Array<{ path: string }>>;
}

export interface ConceptMergeStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export interface PrepareConceptMergeInput {
	merged: ConceptSummary;
	preserveMergedAsView: boolean;
	survivor: ConceptSummary;
}

export interface ConceptMergeWrite {
	after: string;
	before: string;
	label: string;
	path: string;
}

export interface ConceptMergePlan {
	cardsMoved: number;
	cardsPreserved: number;
	dataSnapshot: string;
	duplicateDismissalsMigrated: number;
	merged: ConceptSummary;
	nextData: MnemePluginData;
	pauseMigrated: boolean;
	preserveMergedAsView: boolean;
	relatedConceptsRewired: number;
	sourceLinkChanges: Array<{
		relationType: ConceptSourceLink["relationType"];
		sourcePath: string;
		status: ConceptSourceLink["status"];
	}>;
	sourceLinksMigrated: number;
	sourceLinksPreserved: number;
	survivor: ConceptSummary;
	targetCardsPath?: string;
	writes: ConceptMergeWrite[];
}

export type PrepareConceptMergeResult =
	| { message: string; status: "blocked" }
	| { plan: ConceptMergePlan; status: "ready" };

export type ExecuteConceptMergeResult =
	| { status: "merged" }
	| { message: string; status: "conflict" | "failed" | "invalid" };

export class ConceptMergeService {
	private readonly now: () => string;

	constructor(
		private readonly vault: ConceptMergeVaultAdapter,
		private readonly storage: ConceptMergeStorage,
		now: () => string = () => new Date().toISOString(),
	) {
		this.now = now;
	}

	async prepare(input: PrepareConceptMergeInput): Promise<PrepareConceptMergeResult> {
		if (input.survivor.conceptId === input.merged.conceptId || input.survivor.path === input.merged.path) {
			return { message: "Guided Merge requires two different Concepts.", status: "blocked" };
		}

		try {
			const data = normalizePluginData(await this.storage.loadData());
			assertConceptNotDeleting(data.conceptDeletions, input.survivor.conceptId);
			assertConceptNotDeleting(data.conceptDeletions, input.merged.conceptId);
			assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, input.survivor.conceptId);
			assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, input.merged.conceptId);
			if (data.conceptMergeRecords[input.survivor.conceptId] || data.conceptMergeRecords[input.merged.conceptId]) {
				return { message: "A selected Concept ID is already reserved by an earlier merge.", status: "blocked" };
			}
			const blockingProposal = Object.values(data.knowledgeProposals).find((proposal) => {
				return isActionableProposal(proposal) && proposalReferencesConcept(proposal, input.merged.conceptId);
			});
			if (blockingProposal) {
				return {
					message: `Resolve Inbox proposal ${blockingProposal.id} before merging this Concept.`,
					status: "blocked",
				};
			}

			const survivorMarkdown = await this.vault.read(input.survivor.path);
			const mergedMarkdown = await this.vault.read(input.merged.path);
			if (!hasConceptIdentity(survivorMarkdown, input.survivor.conceptId)
				|| !hasConceptIdentity(mergedMarkdown, input.merged.conceptId)) {
				return { message: "Concept identity changed. Refresh Concept Library before merging.", status: "blocked" };
			}

			for (const [concept, markdown] of [
				[input.survivor, survivorMarkdown], [input.merged, mergedMarkdown],
			] as const) {
				const currentCardsPath = getCardGroupPathFromConceptFrontmatter({
					mneme_type: "concept",
					cards: readMarkdownScalar(markdown, "cards"),
					cards_folder: readMarkdownScalar(markdown, "cards_folder"),
				});
				if (currentCardsPath !== concept.cardsPath) {
					return {
						message: "A Concept's Card Group link changed. Refresh Concept Library before merging.",
						status: "blocked",
					};
				}
			}

			const cardPlanResult = await this.prepareCards(input, survivorMarkdown, mergedMarkdown);
			if (cardPlanResult.status === "blocked") {
				return cardPlanResult;
			}

			const migratedLinks = migrateConceptSourceLinks(
				data.conceptSourceLinks,
				input.merged.conceptId,
				input.survivor.conceptId,
			);
			let finalSurvivorMarkdown = cardPlanResult.survivorMarkdown;
			for (const link of migratedLinks.linksForSurvivor) {
				if (link.status === "approved" || link.status === "stale") {
					finalSurvivorMarkdown = appendConceptSourceNote(finalSurvivorMarkdown, link).markdown;
				}
			}
			if (input.preserveMergedAsView) {
				const perspective = extractMergedPerspective(mergedMarkdown);
				if (perspective) {
					finalSurvivorMarkdown = appendConceptView(finalSurvivorMarkdown, {
						body: perspective,
						title: `Merged from ${input.merged.title} (${input.merged.conceptId})`,
					}).markdown;
				}
			}
			const relatedPlan = await prepareRelatedConceptMerge(
				this.vault,
				input.survivor,
				input.merged,
				survivorMarkdown,
				mergedMarkdown,
				finalSurvivorMarkdown,
			);
			finalSurvivorMarkdown = relatedPlan.survivorMarkdown;
			if (input.preserveMergedAsView) {
				this.assertPerspectiveRelocationSafe(input.merged, mergedMarkdown, input.survivor.path, finalSurvivorMarkdown);
			}

			const mergedAt = this.now();
			const nextData = migratePluginDataForConceptMerge(
				data,
				input.survivor,
				input.merged,
				migratedLinks.links,
				mergedAt,
			);
			let writes = [...cardPlanResult.writes];
			for (const relatedWrite of relatedPlan.writes) {
				writes = upsertWrite(writes, relatedWrite);
			}
			writes = upsertWrite(writes, {
				after: finalSurvivorMarkdown,
				before: survivorMarkdown,
				label: "Surviving Concept",
				path: input.survivor.path,
			});
			writes.push({
				after: renderConceptRedirect(input.survivor, input.merged, mergedAt),
				before: mergedMarkdown,
				label: "Redirect Note",
				path: input.merged.path,
			});

			assertMergeHasNoPendingWrites(data, [
				...writes.map((write) => write.path),
				...[input.survivor.cardsPath, input.merged.cardsPath].filter((path): path is string => !!path),
			], [input.survivor.conceptId, input.merged.conceptId]);

			for (const write of writes) {
				assertCardDeletionAllowsPath(data.cardDeletion, write.path);
				assertCardIdRepairAllowsPath(data.cardIdRepairs, write.path);
				assertConceptIdRepairAllowsPath(data.conceptIdRepairs, write.path);
			}
			return {
				plan: {
					cardsMoved: cardPlanResult.cardsMoved,
					cardsPreserved: cardPlanResult.cardsPreserved,
					dataSnapshot: JSON.stringify(data),
					duplicateDismissalsMigrated: Object.values(data.conceptDuplicateDismissals)
						.filter((dismissal) => dismissal.conceptIds.includes(input.merged.conceptId)).length,
					merged: input.merged,
					nextData,
					pauseMigrated: !!data.pausedConcepts[input.merged.conceptId],
					preserveMergedAsView: input.preserveMergedAsView,
					relatedConceptsRewired: relatedPlan.relatedConceptsRewired,
					sourceLinkChanges: Object.values(data.conceptSourceLinks)
						.filter((link) => link.conceptId === input.merged.conceptId)
						.map((link) => ({
							relationType: link.relationType,
							sourcePath: link.sourcePath,
							status: link.status,
						})),
					sourceLinksMigrated: migratedLinks.migratedCount,
					sourceLinksPreserved: Object.values(nextData.conceptSourceLinks)
						.filter((link) => link.conceptId === input.survivor.conceptId
							&& (link.status === "approved" || link.status === "stale")).length,
					survivor: input.survivor,
					targetCardsPath: cardPlanResult.targetCardsPath,
					writes,
				},
				status: "ready",
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Could not prepare Guided Merge.",
				status: "blocked",
			};
		}
	}

	async execute(plan: ConceptMergePlan, finalSurvivorMarkdown: string): Promise<ExecuteConceptMergeResult> {
		return runPluginDataMutation(this.storage, async () => {
			const plannedSurvivorMarkdown = plan.writes.find((write) => write.path === plan.survivor.path)?.after;
			const validationMessage = validateFinalSurvivorMarkdown(
				finalSurvivorMarkdown,
				plan.survivor,
				plan.targetCardsPath,
				plannedSurvivorMarkdown,
			);
			if (validationMessage) {
				return { message: validationMessage, status: "invalid" };
			}

			const writes = plan.writes.map((write) => write.path === plan.survivor.path
				? { ...write, after: finalSurvivorMarkdown }
				: write);
			try {
				for (const write of writes) {
					if (await this.vault.read(write.path) !== write.before) {
						return { message: `${write.path} changed after preview.`, status: "conflict" };
					}
				}
				const latestData = normalizePluginData(await this.storage.loadData());
				if (JSON.stringify(latestData) !== plan.dataSnapshot) {
					return { message: "Mneme state changed after preview. Rebuild the merge preview.", status: "conflict" };
				}
				const source = writes.find((write) => write.path === plan.merged.cardsPath);
				const target = writes.find((write) => write.path === plan.targetCardsPath);
				if (source && target && source.path !== target.path) {
					try {
						this.assertRelocationSafe(inspectCardGroup(source.before, source.path), source, target);
					} catch (error) {
						return { message: error instanceof Error ? error.message : "Card references changed after preview.", status: "conflict" };
					}
				}
				if (plan.preserveMergedAsView) {
					const mergedWrite = writes.find((write) => write.path === plan.merged.path);
					if (!mergedWrite) return { message: "Merged Concept snapshot is missing. Rebuild the preview.", status: "invalid" };
					try {
						this.assertPerspectiveRelocationSafe(plan.merged, mergedWrite.before, plan.survivor.path, finalSurvivorMarkdown);
					} catch (error) {
						return { message: error instanceof Error ? error.message : "Concept references changed after preview.", status: "conflict" };
					}
				}

				await executeMarkdownWriteTransaction(this.vault, writes, {
					commit: () => this.storage.saveData(plan.nextData),
					rollback: () => this.storage.saveData(latestData),
				});

				return { status: "merged" };
			} catch (error) {
				return {
					message: error instanceof Error ? error.message : "Guided Merge failed.",
					status: error instanceof MarkdownWriteConflict ? "conflict" : "failed",
				};
			}
		});
	}

	private assertPerspectiveRelocationSafe(
		merged: ConceptSummary,
		sourceMarkdown: string,
		targetPath: string,
		targetMarkdown: string,
	): void {
		const perspective = extractMergedPerspective(sourceMarkdown);
		if (!perspective) return;
		assertMarkdownRelocationSafe(
			[{ label: `Concept ${merged.conceptId} perspective`, raw: perspective }],
			{ path: merged.path, markdown: sourceMarkdown },
			{ path: targetPath, markdown: targetMarkdown },
			this.vault.resolveLinkpath?.bind(this.vault),
		);
	}

	private assertRelocationSafe(
		cards: RawCardBlock[],
		source: { path: string; before: string },
		target: { path: string; before: string },
	): void {
		assertCardRelocationSafe(
			cards,
			{ path: source.path, markdown: source.before },
			{ path: target.path, markdown: target.before },
			this.vault.resolveLinkpath?.bind(this.vault),
		);
	}

	private async prepareCards(
		input: PrepareConceptMergeInput,
		survivorMarkdown: string,
		mergedMarkdown: string,
	): Promise<
		| { message: string; status: "blocked" }
		| {
			cardsMoved: number;
			cardsPreserved: number;
			status: "ready";
			survivorMarkdown: string;
			targetCardsPath?: string;
			writes: ConceptMergeWrite[];
		}
	> {
		const legacyFolder = [input.survivor, input.merged]
			.find((concept) => concept.cardsPath && !/\.md$/i.test(concept.cardsPath));
		if (legacyFolder?.cardsPath) {
			return {
				message: `Legacy per-Card folder must be consolidated before Guided Merge: ${legacyFolder.cardsPath}`,
				status: "blocked",
			};
		}
		const survivorCardsExist = input.survivor.cardsPath
			? await this.vault.exists(input.survivor.cardsPath)
			: false;
		const mergedCardsExist = input.merged.cardsPath
			? await this.vault.exists(input.merged.cardsPath)
			: false;
		if (
			input.survivor.cardsPath
			&& input.survivor.cardsPath === input.merged.cardsPath
			&& (survivorCardsExist || mergedCardsExist)
		) {
			return { message: "Both Concepts reference the same Card Group. Repair that association first.", status: "blocked" };
		}

		const survivorCardsBefore = input.survivor.cardsPath && survivorCardsExist
			? await this.vault.read(input.survivor.cardsPath)
			: undefined;
		const mergedCardsBefore = input.merged.cardsPath && mergedCardsExist
			? await this.vault.read(input.merged.cardsPath)
			: undefined;
		const targetCardsPath = survivorCardsBefore
			? input.survivor.cardsPath
			: mergedCardsBefore
				? input.merged.cardsPath
				: input.survivor.cardsPath ?? input.merged.cardsPath;
		if (survivorCardsBefore && !hasCardGroupIdentity(survivorCardsBefore, input.survivor.conceptId)) {
			return { message: "The surviving Card Group association changed. Repair it first.", status: "blocked" };
		}
		if (mergedCardsBefore && !hasCardGroupIdentity(mergedCardsBefore, input.merged.conceptId)) {
			return { message: "The merged Card Group association changed. Repair it first.", status: "blocked" };
		}
		const targetBefore = survivorCardsBefore ?? mergedCardsBefore;
		const targetBlocks = targetBefore ? inspectCardGroup(targetBefore, targetCardsPath ?? "Card.md") : [];
		const sourceBlocks = survivorCardsBefore && mergedCardsBefore
			? inspectCardGroup(mergedCardsBefore, input.merged.cardsPath ?? "Card.md")
			: [];
		const targetIds = new Set(targetBlocks.map((block) => block.cardId));
		const duplicateId = sourceBlocks.find((block) => targetIds.has(block.cardId));
		if (duplicateId) {
			return { message: `Card ID ${duplicateId.cardId} exists in both Card Groups. Repair it first.`, status: "blocked" };
		}
		if (sourceBlocks.length > 0 && input.merged.cardsPath && targetCardsPath && mergedCardsBefore && targetBefore) {
			this.assertRelocationSafe(sourceBlocks,
				{ path: input.merged.cardsPath, before: mergedCardsBefore },
				{ path: targetCardsPath, before: targetBefore });
		}

		let nextSurvivorMarkdown = survivorMarkdown;
		const writes: ConceptMergeWrite[] = [];
		if (targetCardsPath) {
			nextSurvivorMarkdown = setFrontmatterScalar(
				nextSurvivorMarkdown,
				"cards",
				quoteYaml(toObsidianInternalLink(targetCardsPath, `${input.survivor.title} Cards`)),
			);
			if (targetBefore) {
				let targetAfter = updateCardGroupAssociation(targetBefore, input.survivor);
				if (sourceBlocks.length > 0) {
					targetAfter = `${targetAfter.trimEnd()}\n\n${sourceBlocks.map((block) => block.raw).join("\n\n")}\n`;
				}
				writes.push({
					after: targetAfter,
					before: targetBefore,
					label: "Surviving Card Group",
					path: targetCardsPath,
				});
			}
		}

		if (survivorCardsBefore && mergedCardsBefore && input.merged.cardsPath) {
			writes.push({
				after: renderFormerCardGroupRedirect(mergedCardsBefore, sourceBlocks, input.survivor, targetCardsPath as string),
				before: mergedCardsBefore,
				label: "Former Card Group Redirect",
				path: input.merged.cardsPath,
			});
		}

		return {
			cardsMoved: mergedCardsBefore
				? (survivorCardsBefore ? sourceBlocks.length : targetBlocks.length)
				: 0,
			cardsPreserved: targetBlocks.length + sourceBlocks.length,
			status: "ready",
			survivorMarkdown: nextSurvivorMarkdown,
			targetCardsPath,
			writes,
		};
	}
}

interface RelatedConceptSnapshot {
	conceptId: string;
	markdown: string;
	path: string;
	title: string;
}

async function prepareRelatedConceptMerge(
	vault: ConceptMergeVaultAdapter,
	survivor: ConceptSummary,
	merged: ConceptSummary,
	survivorBefore: string,
	mergedBefore: string,
	preparedSurvivorMarkdown: string,
): Promise<{
	relatedConceptsRewired: number;
	survivorMarkdown: string;
	writes: ConceptMergeWrite[];
}> {
	const snapshots: RelatedConceptSnapshot[] = [];
	for (const file of await vault.listMarkdownFiles()) {
		const key = comparableConceptPath(file.path);
		let markdown: string;
		if (key === comparableConceptPath(survivor.path)) {
			markdown = survivorBefore;
		} else if (key === comparableConceptPath(merged.path)) {
			markdown = mergedBefore;
		} else {
			markdown = await vault.read(file.path);
		}
		const conceptId = readFrontmatterScalar(markdown, "mneme_id");
		if (readFrontmatterScalar(markdown, "mneme_type") !== "concept" || !conceptId) {
			continue;
		}
		snapshots.push({
			conceptId,
			markdown,
			path: file.path,
			title: parseConceptTitle(markdown, file.path),
		});
	}

	const byPath = new Map(snapshots.map((snapshot) => [comparableConceptPath(snapshot.path), snapshot]));
	const basenameCandidates = new Map<string, RelatedConceptSnapshot[]>();
	for (const snapshot of snapshots) {
		const basename = comparableConceptPath(snapshot.path).split("/").pop() ?? "";
		basenameCandidates.set(basename, [...(basenameCandidates.get(basename) ?? []), snapshot]);
	}
	const byBasename = new Map([...basenameCandidates.entries()]
		.filter(([, matches]) => matches.length === 1)
		.map(([basename, matches]) => [basename, matches[0] as RelatedConceptSnapshot]));
	const resolve = (target: string): RelatedConceptSnapshot | undefined => {
		const comparable = comparableConceptPath(target);
		return byPath.get(comparable) ?? byBasename.get(comparable.split("/").pop() ?? "");
	};
	const survivorKey = comparableConceptPath(survivor.path);
	const mergedKey = comparableConceptPath(merged.path);
	const isMergeParticipant = (snapshot: RelatedConceptSnapshot | undefined): boolean => {
		if (!snapshot) return false;
		const key = comparableConceptPath(snapshot.path);
		return key === survivorKey || key === mergedKey;
	};

	const neighbors = new Map<string, RelatedConceptSnapshot>();
	const addNeighbor = (snapshot: RelatedConceptSnapshot): void => {
		const existing = neighbors.get(snapshot.conceptId);
		if (existing && comparableConceptPath(existing.path) !== comparableConceptPath(snapshot.path)) {
			throw new Error(`Related Concept ID ${snapshot.conceptId} appears in more than one file. Repair it before merging.`);
		}
		neighbors.set(snapshot.conceptId, snapshot);
	};
	let nextSurvivor = preparedSurvivorMarkdown;
	for (const link of parseRelatedConceptLinks(nextSurvivor)) {
		const target = resolve(link.target);
		if (isMergeParticipant(target)) {
			nextSurvivor = removeRelatedConceptLink(nextSurvivor, link.target).markdown;
		} else if (target) {
			addNeighbor(target);
		}
	}
	for (const link of parseRelatedConceptLinks(mergedBefore)) {
		const target = resolve(link.target);
		if (target && !isMergeParticipant(target)) {
			addNeighbor(target);
		} else if (!target) {
			nextSurvivor = addRelatedConceptLink(nextSurvivor, {
				path: link.target,
				title: link.display ?? link.target.split("/").pop() ?? link.target,
			}).markdown;
		}
	}
	for (const snapshot of snapshots) {
		if (isMergeParticipant(snapshot)) continue;
		const linksParticipant = parseRelatedConceptLinks(snapshot.markdown)
			.some((link) => isMergeParticipant(resolve(link.target)));
		if (linksParticipant) {
			addNeighbor(snapshot);
		}
	}

	const writes: ConceptMergeWrite[] = [];
	for (const neighbor of neighbors.values()) {
		let after = neighbor.markdown;
		for (const link of parseRelatedConceptLinks(after)) {
			if (isMergeParticipant(resolve(link.target))) {
				after = removeRelatedConceptLink(after, link.target).markdown;
			}
		}
		after = addRelatedConceptLink(after, survivor).markdown;
		nextSurvivor = addRelatedConceptLink(nextSurvivor, neighbor).markdown;
		if (after !== neighbor.markdown) {
			writes.push({
				after,
				before: neighbor.markdown,
				label: "Related Concept Rewire",
				path: neighbor.path,
			});
		}
	}

	return {
		relatedConceptsRewired: neighbors.size,
		survivorMarkdown: nextSurvivor,
		writes,
	};
}

interface RawCardBlock {
	cardId: string;
	raw: string;
	start: number;
}

function inspectCardGroup(markdown: string, path: string): RawCardBlock[] {
	const parsed = parseMnemeCards(markdown);
	if (parsed.some((card) => !card.isValid || !card.explicitCardId)) {
		throw new Error(`Repair every Card ID and marker error before merging: ${path}`);
	}
	const blocks = Array.from(markdown.matchAll(/<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g));
	if (blocks.length !== parsed.length) {
		throw new Error(`Card Group contains legacy or malformed blocks: ${path}`);
	}

	const ids = new Set<string>();
	const inspected = blocks.map((match, index) => {
		const cardId = parsed[index]!.explicitCardId!;
		if (ids.has(cardId)) {
			throw new Error(`Card ID ${cardId} appears more than once in ${path}. Repair it before merging.`);
		}
		ids.add(cardId);
		return { cardId, raw: match[0] ?? "", start: match.index ?? 0 };
	});
	// Mixed legacy sections must not become phantom Cards after the blocks move.
	if (/<!--\s*MNEME:(?:FRONT|BACK|RUBRIC):/.test(removeCardBlocks(markdown, inspected))) {
		throw new Error(`Card Group contains section markers outside a Card block: ${path}. Repair it before merging.`);
	}
	return inspected;
}

function updateCardGroupAssociation(markdown: string, survivor: ConceptSummary): string {
	let updated = setFrontmatterScalar(markdown, "mneme_concept_id", survivor.conceptId);
	updated = setFrontmatterScalar(
		updated,
		"concept",
		quoteYaml(toObsidianInternalLink(survivor.path, survivor.title)),
	);
	return updated;
}

function migratePluginDataForConceptMerge(
	data: MnemePluginData,
	survivor: ConceptSummary,
	merged: ConceptSummary,
	conceptSourceLinks: MnemePluginData["conceptSourceLinks"],
	mergedAt: string,
): MnemePluginData {
	const sourcePause = data.pausedConcepts[merged.conceptId];
	const survivorPause = data.pausedConcepts[survivor.conceptId];
	const pausedAt = [sourcePause?.pausedAt, survivorPause?.pausedAt].filter((value): value is string => !!value).sort()[0];
	const pausedConcepts = { ...data.pausedConcepts };
	delete pausedConcepts[merged.conceptId];
	if (pausedAt) {
		pausedConcepts[survivor.conceptId] = { conceptId: survivor.conceptId, pausedAt };
	}

	const sourceAnalysisRecords = Object.fromEntries(Object.entries(data.sourceAnalysisRecords).map(([path, record]) => [
		path,
		{
			...record,
			linkedConceptIds: [...new Set(record.linkedConceptIds.map((id) => id === merged.conceptId ? survivor.conceptId : id))],
		},
	]));
	const conceptDuplicateDismissals = migrateDuplicateDismissals(
		data.conceptDuplicateDismissals,
		merged.conceptId,
		survivor.conceptId,
	);
	const conceptMergeRecords = Object.fromEntries(Object.entries(data.conceptMergeRecords).map(([conceptId, record]) => [
		conceptId,
		record.survivorConceptId === merged.conceptId
			? { ...record, survivorConceptId: survivor.conceptId, survivorPath: survivor.path }
			: record,
	]));

	return {
		...data,
		conceptDuplicateDismissals,
		conceptMergeRecords: {
			...conceptMergeRecords,
			[merged.conceptId]: {
				mergedAt,
				mergedConceptId: merged.conceptId,
				mergedPath: merged.path,
				survivorConceptId: survivor.conceptId,
				survivorPath: survivor.path,
			},
		},
		conceptSourceLinks,
		pausedConcepts,
		sourceAnalysisRecords,
	};
}

function migrateDuplicateDismissals(
	dismissals: Record<string, ConceptDuplicateDismissal>,
	mergedId: string,
	survivorId: string,
): Record<string, ConceptDuplicateDismissal> {
	const migrated: Record<string, ConceptDuplicateDismissal> = {};
	for (const dismissal of Object.values(dismissals)) {
		const ids = dismissal.conceptIds.map((id) => id === mergedId ? survivorId : id) as [string, string];
		if (ids[0] === ids[1]) {
			continue;
		}
		const conceptIds = [...ids].sort() as [string, string];
		const pairKey = createConceptDuplicatePairKey(conceptIds[0], conceptIds[1]);
		const existing = migrated[pairKey];
		if (!existing || dismissal.dismissedAt > existing.dismissedAt) {
			migrated[pairKey] = { ...dismissal, conceptIds, pairKey };
		}
	}
	return migrated;
}

function migrateConceptSourceLinks(
	links: Record<string, ConceptSourceLink>,
	mergedId: string,
	survivorId: string,
): { links: Record<string, ConceptSourceLink>; linksForSurvivor: ConceptSourceLink[]; migratedCount: number } {
	const migrated: Record<string, ConceptSourceLink> = {};
	const idsBySignature = new Map<string, string>();
	const affectedSignatures = new Set<string>();
	let migratedCount = 0;
	const unchanged = Object.values(links).filter((link) => link.conceptId !== mergedId);
	const moving = Object.values(links).filter((link) => link.conceptId === mergedId);
	for (const link of unchanged) {
		if (link.conceptId !== survivorId) {
			migrated[link.id] = link;
			continue;
		}
		const signature = JSON.stringify([link.conceptId, link.sourcePath, link.relationType]);
		const existingId = idsBySignature.get(signature);
		if (existingId && migrated[existingId]) {
			migrated[existingId] = mergeSourceLinks(migrated[existingId] as ConceptSourceLink, { ...link, id: existingId });
		} else {
			idsBySignature.set(signature, link.id);
			migrated[link.id] = link;
		}
	}
	for (const link of moving) {
		migratedCount += 1;
		const conceptId = survivorId;
		const proposedId = conceptId === link.conceptId
			? link.id
			: createConceptSourceLinkId(conceptId, link.sourcePath, link.relationType);
		const next = { ...link, conceptId, id: proposedId };
		const signature = JSON.stringify([conceptId, link.sourcePath, link.relationType]);
		affectedSignatures.add(signature);
		const existingId = idsBySignature.get(signature);
		if (existingId) {
			const existing = migrated[existingId];
			if (existing) {
				migrated[existingId] = mergeSourceLinks(existing, { ...next, id: existingId });
			}
		} else {
			const id = createUniqueRecordId(proposedId, migrated);
			idsBySignature.set(signature, id);
			migrated[id] = { ...next, id };
		}
	}

	return {
		links: migrated,
		linksForSurvivor: Object.values(migrated).filter((link) => {
			return link.conceptId === survivorId
				&& affectedSignatures.has(JSON.stringify([link.conceptId, link.sourcePath, link.relationType]));
		}),
		migratedCount,
	};
}

function createUniqueRecordId(baseId: string, records: Record<string, unknown>): string {
	if (!records[baseId]) {
		return baseId;
	}
	let suffix = 2;
	while (records[`${baseId}:${suffix}`]) {
		suffix += 1;
	}
	return `${baseId}:${suffix}`;
}

function mergeSourceLinks(first: ConceptSourceLink, second: ConceptSourceLink): ConceptSourceLink {
	const evidence = dedupeEvidence([...first.evidence, ...second.evidence]);
	const latest = first.lastSeenAt >= second.lastSeenAt ? first : second;
	return {
		...latest,
		addedAt: first.addedAt <= second.addedAt ? first.addedAt : second.addedAt,
		evidence,
		id: first.id,
		lastSeenAt: first.lastSeenAt >= second.lastSeenAt ? first.lastSeenAt : second.lastSeenAt,
		status: strongerSourceStatus(first.status, second.status),
	};
}

function dedupeEvidence(evidence: SourceEvidence[]): SourceEvidence[] {
	const seen = new Set<string>();
	return evidence.filter((item) => {
		const key = JSON.stringify(item);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function strongerSourceStatus(
	first: ConceptSourceLink["status"],
	second: ConceptSourceLink["status"],
): ConceptSourceLink["status"] {
	const rank: Record<ConceptSourceLink["status"], number> = { approved: 4, stale: 3, suggested: 2, rejected: 1 };
	return rank[first] >= rank[second] ? first : second;
}

function proposalReferencesConcept(proposal: KnowledgeProposal, conceptId: string): boolean {
	if (proposal.conceptId === conceptId) {
		return true;
	}
	return containsExactString(proposal.payload, conceptId);
}

function containsExactString(value: unknown, target: string): boolean {
	if (value === target) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some((item) => containsExactString(item, target));
	}
	if (typeof value === "object" && value !== null) {
		return Object.values(value).some((item) => containsExactString(item, target));
	}
	return false;
}

function isActionableProposal(proposal: KnowledgeProposal): boolean {
	return proposal.status === "suggested"
		|| proposal.status === "opened"
		|| proposal.status === "edited"
		|| proposal.status === "approved";
}

function renderConceptRedirect(survivor: ConceptSummary, merged: ConceptSummary, mergedAt: string): string {
	const link = toObsidianInternalLink(survivor.path, survivor.title);
	return [
		"---",
		"mneme_type: concept_redirect",
		"mneme_version: 1",
		`former_mneme_id: ${merged.conceptId}`,
		`merged_into: ${survivor.conceptId}`,
		`merged_at: ${mergedAt}`,
		`redirect_to: ${quoteYaml(link)}`,
		"---",
		"",
		`# ${merged.title}`,
		"",
		"> [!info] Merged Concept",
		`> This Concept was merged into ${link}.`,
		"",
	].join("\n");
}

function removeCardBlocks(markdown: string, blocks: readonly RawCardBlock[]): string {
	// Offsets refer to the original file; remove from the end to preserve them.
	return blocks.reduceRight((content, block) =>
		content.slice(0, block.start) + content.slice(block.start + block.raw.length), markdown);
}

function renderFormerCardGroupRedirect(
	markdown: string,
	blocks: readonly RawCardBlock[],
	survivor: ConceptSummary,
	targetCardsPath: string,
): string {
	const remaining = setFrontmatterScalar(removeCardBlocks(markdown, blocks), "mneme_type", "card_group");
	const link = toObsidianInternalLink(targetCardsPath, `${survivor.title} Cards`);
	const redirected = setFrontmatterScalar(
		updateCardGroupAssociation(remaining, survivor), "redirect_cards_to", quoteYaml(link),
	);
	return `${redirected}\n\nCards moved to ${link}.\n`;
}

function extractMergedPerspective(markdown: string): string | undefined {
	for (const link of parseRelatedConceptLinks(markdown)) {
		markdown = removeRelatedConceptLink(markdown, link.target).markdown;
	}
	const cardsPath = getCardGroupPathFromConceptFrontmatter({
		mneme_type: "concept",
		cards: readMarkdownScalar(markdown, "cards"),
		cards_folder: readMarkdownScalar(markdown, "cards_folder"),
	});
	const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
	const lines = body.split(/\r?\n/);
	const kept: string[] = [];
	let fence: { character: string; length: number } | undefined;
	let inReviewCards = false;
	for (const line of lines) {
		const fenceMarker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (fenceMarker?.[1]?.[0] === fence.character
				&& fenceMarker[1].length >= fence.length && !fenceMarker[2]?.trim()) fence = undefined;
			kept.push(line);
			continue;
		}
		if (fenceMarker?.[1] && !(fenceMarker[1][0] === "`" && fenceMarker[2]?.includes("`"))) {
			fence = { character: fenceMarker[1][0]!, length: fenceMarker[1].length };
			kept.push(line);
			continue;
		}
		const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (heading) {
			const level = heading[1]?.length ?? 1;
			inReviewCards = level === 2 && heading[2]?.toLowerCase() === "review cards";
			if (level === 1) continue;
			kept.push(`${"#".repeat(Math.min(6, level + 2))} ${heading[2]}`);
			continue;
		}
		// The template's navigation is managed by the surviving Concept, even when
		// its declared Card Group has not been created yet. Keep authored notes here.
		const cardsNavigation = inReviewCards ? /^Cards:\s*(\[\[[^\]]+\]\])\s*$/.exec(line) : null;
		if (cardsPath && cardsNavigation?.[1]
			&& normalizeLinkedMarkdownPath(cardsNavigation[1]) === normalizeLinkedMarkdownPath(cardsPath)) continue;
		kept.push(line);
	}
	const result = kept.join("\n").trim();
	return result || undefined;
}

function validateFinalSurvivorMarkdown(
	markdown: string,
	survivor: ConceptSummary,
	targetCardsPath: string | undefined,
	plannedMarkdown: string | undefined,
): string | undefined {
	if (!hasConceptIdentity(markdown, survivor.conceptId)) {
		return "Final Markdown must keep the surviving Concept ID and mneme_type: concept.";
	}
	if (targetCardsPath) {
		const cards = readFrontmatterScalar(markdown, "cards");
		if (!cards || normalizeLinkedMarkdownPath(cards) !== normalizeLinkedMarkdownPath(targetCardsPath)) {
			return "Final Markdown must keep the surviving Card Group link.";
		}
	}
	if (plannedMarkdown && JSON.stringify(readRelatedTargets(markdown)) !== JSON.stringify(readRelatedTargets(plannedMarkdown))) {
		return "Final Markdown must keep the Related Concept links shown in the Merge preview. Manage relationships separately after Merge.";
	}
	return undefined;
}

function readRelatedTargets(markdown: string): string[] {
	return parseRelatedConceptLinks(markdown)
		.map((link) => comparableConceptPath(link.target))
		.sort();
}

function normalizeLinkedMarkdownPath(value: string): string {
	const linkMatch = /^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(value);
	const path = (linkMatch?.[1] ?? value).trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");

	return /\.md$/i.test(path) ? path : `${path}.md`;
}

function hasConceptIdentity(markdown: string, conceptId: string): boolean {
	return readFrontmatterScalar(markdown, "mneme_type") === "concept"
		&& readFrontmatterScalar(markdown, "mneme_id") === conceptId;
}

function hasCardGroupIdentity(markdown: string, conceptId: string): boolean {
	return readFrontmatterScalar(markdown, "mneme_type") === "card_group"
		&& readFrontmatterScalar(markdown, "mneme_concept_id") === conceptId;
}

function readFrontmatterScalar(markdown: string, key: string): string | undefined {
	try {
		return readMarkdownScalar(markdown, key);
	} catch {
		return undefined;
	}
}

function setFrontmatterScalar(markdown: string, key: string, value: string): string {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	if (!match) {
		throw new Error("Markdown frontmatter is required for Guided Merge.");
	}
	const lines = (match[1] ?? "").split(/\r?\n/);
	const indexes = lines.flatMap((line, index) => new RegExp(`^(?:${key}|"${key}"|'${key}')[ \t]*:`).test(line) ? [index] : []);
	if (indexes.length > 1) {
		throw new Error(`Frontmatter field appears more than once: ${key}`);
	}
	if (indexes[0] === undefined) {
		lines.push(`${key}: ${value}`);
	} else {
		lines[indexes[0]] = `${key}: ${value}`;
	}
	const fullFrontmatter = match[0] ?? "";
	return `---\n${lines.join("\n")}\n---\n${markdown.slice(fullFrontmatter.length)}`;
}

function quoteYaml(value: string): string {
	return JSON.stringify(value);
}

function upsertWrite(writes: ConceptMergeWrite[], write: ConceptMergeWrite): ConceptMergeWrite[] {
	const result = [...writes];
	const index = result.findIndex((candidate) => candidate.path === write.path);
	if (index >= 0) {
		result[index] = write;
	} else {
		result.push(write);
	}
	return result;
}
