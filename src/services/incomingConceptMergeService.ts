import { assertMergeHasNoPendingWrites } from "./mergePendingWrites";
import { getConceptId } from "./conceptIdEditor";
import { assertCardDeletionAllowsPath } from "./cardDeletionReceipt";
import { assertCardIdRepairAllowsPath } from "./cardIdRepairReceipt";
import { assertConceptIdRepairAllowsConcept, assertConceptIdRepairAllowsPath } from "./conceptIdRepairReceipt";
import { assertConceptNotDeleting } from "./conceptDeletionReceipt";
import type { ConceptSummary } from "../models/conceptLibrary";
import type { ConceptSourceLink } from "../models/conceptSource";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { MnemePluginData } from "../models/reviewState";
import type { ManualConceptSourceSnapshot } from "./manualConceptProvenanceService";
import type { ManualConceptInput } from "./manualConceptService";
import { createEmptyManualConceptDraft } from "../models/manualConceptDraft";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	createConceptSourceLinkId,
	mergeLinkedConceptId,
} from "./conceptSourceLinking";
import { appendConceptView } from "./conceptViewAppender";
import {
	applyConceptMergeDraft,
	type ConceptMergeDraft,
} from "./conceptMergeDraft";
import { applyProposalStatus } from "./knowledgeProposalLifecycle";
import { normalizePluginData } from "./reviewStateStore";
import { runPluginDataMutation } from "./pluginDataMutation";
import { readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import {
	MarkdownWriteConflict,
	type TransactionalMarkdownVault,
} from "./markdownWriteTransaction";
import {
	getPendingIncomingConceptMerge,
	incomingMergeMarkdownHash,
	incomingMergeOriginHash,
	INCOMING_MERGE_RESUME_MESSAGE,
	readIncomingConceptMergeReceipt,
	type IncomingConceptMergeReceipt,
} from "./incomingConceptMergeRecovery";

export type IncomingConceptMergeVault = TransactionalMarkdownVault;

export interface IncomingConceptMergeStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export interface PrepareIncomingConceptMergeInput {
	draft: ConceptMergeDraft;
	existing: ConceptSummary;
	origin:
		| {
			kind: "inbox";
			proposalId: string;
			proposalUpdatedAt: string;
		}
		| {
			input: ManualConceptInput & { updatedAt?: string };
			kind: "manual";
			source?: ManualConceptSourceSnapshot;
		};
}

export interface IncomingConceptMergePlan {
	after: string;
	before: string;
	dataSnapshot: string;
	existing: ConceptSummary;
	receipt: IncomingConceptMergeReceipt;
	sourceLinksAdded: number;
	viewsAdded: number;
}

export type PrepareIncomingConceptMergeResult =
	| { message: string; status: "blocked" }
	| { plan: IncomingConceptMergePlan; status: "ready" };

export type ExecuteIncomingConceptMergeResult =
	| { status: "merged" }
	| { message: string; status: "conflict" | "failed" };

export type ResumeIncomingConceptMergeResult =
	| { status: "merged"; receipt: IncomingConceptMergeReceipt; manualDraftId?: string }
	| { status: "none" | "not-applied" }
	| { status: "conflict" | "failed"; message: string };

export class IncomingConceptMergeService {
	constructor(
		private readonly vault: IncomingConceptMergeVault,
		private readonly storage: IncomingConceptMergeStorage,
		private readonly now: () => string = () => new Date().toISOString(),
	) {
	}

	async prepare(input: PrepareIncomingConceptMergeInput): Promise<PrepareIncomingConceptMergeResult> {
		try {
			const data = normalizePluginData(await this.storage.loadData());
			if (getPendingIncomingConceptMerge(data)) throw new Error(INCOMING_MERGE_RESUME_MESSAGE);
			assertConceptNotDeleting(data.conceptDeletions, input.existing.conceptId);
			assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, input.existing.conceptId);
			assertCardDeletionAllowsPath(data.cardDeletion, input.existing.path);
			assertCardIdRepairAllowsPath(data.cardIdRepairs, input.existing.path);
			assertConceptIdRepairAllowsPath(data.conceptIdRepairs, input.existing.path);
			const before = await this.vault.read(input.existing.path);
			if (getConceptId(before) !== input.existing.conceptId) {
				return {
					message: "The existing Concept identity changed. Return to the conflict options and try again.",
					status: "blocked",
				};
			}

			const now = this.now();
			let sourceLinks: ConceptSourceLink[];
			let views: NonNullable<Extract<KnowledgeProposal, { kind: "new_concept" }>["payload"]>["proposedViews"];

			if (input.origin.kind === "inbox") {
				const proposal = getInboxProposal(data, input.origin.proposalId);
				if (!proposal) {
					return {
						message: "The incoming Inbox proposal is no longer available for Merge.",
						status: "blocked",
					};
				}
				if (proposal.writeReceipt !== undefined) {
					return {
						message: "Resume the pending Inbox write before starting Merge.",
						status: "blocked",
					};
				}
				if (proposal.updatedAt !== input.origin.proposalUpdatedAt) {
					return {
						message: "The incoming Proposal changed. Return to Inbox and start Merge again.",
						status: "blocked",
					};
				}
				sourceLinks = buildConceptSourceLinksFromNewConceptProposal({
					conceptId: input.existing.conceptId,
					now,
					proposal,
				});
				views = proposal.payload?.proposedViews ?? [];
			} else {
				const manualWrite = data.manualConceptWrite === undefined
					? undefined
					: readManualConceptWriteReceipt(data.manualConceptWrite);
				if (manualWrite?.status === "pending") {
					return {
						message: "Resume the pending Concept creation before starting Merge.",
						status: "blocked",
					};
				}
				if (!manualDraftMatches(data, input.origin.input)) {
					return {
						message: "The Create Concept draft changed. Return to the Composer and start Merge again.",
						status: "blocked",
					};
				}
				sourceLinks = buildManualConceptSourceLinks(
					input.existing.conceptId,
					input.origin.input,
					input.origin.source,
					now,
				);
				views = [];
			}
			assertMergeHasNoPendingWrites(data, [input.existing.path]);
			let after = applyConceptMergeDraft(before, input.draft);

			for (const view of views) {
				after = appendConceptView(after, view).markdown;
			}
			for (const link of sourceLinks) {
				after = appendConceptSourceNote(after, link).markdown;
			}

			const inputHash = await incomingMergeOriginHash(data, input.origin);
			const receipt = readIncomingConceptMergeReceipt({
				version: 1,
				status: "pending",
				operationId: globalThis.crypto.randomUUID(),
				conceptId: input.existing.conceptId,
				path: input.existing.path,
				beforeHash: await incomingMergeMarkdownHash(before),
				afterHash: await incomingMergeMarkdownHash(after),
				createdAt: now,
				origin: input.origin.kind === "inbox"
					? { kind: "inbox", proposalId: input.origin.proposalId, inputHash }
					: { kind: "manual", inputHash, draftId: data.manualConceptDraftId,
						source: input.origin.source ? { ...input.origin.source } : undefined },
			});
			return {
				plan: {
					after,
					before,
					dataSnapshot: JSON.stringify(data),
					existing: input.existing,
					receipt,
					sourceLinksAdded: sourceLinks.length,
					viewsAdded: views.length,
				},
				status: "ready",
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Could not prepare the incoming Concept Merge.",
				status: "blocked",
			};
		}
	}

	async execute(plan: IncomingConceptMergePlan): Promise<ExecuteIncomingConceptMergeResult> {
		return runPluginDataMutation(this.storage, async () => {
			try {
				const latestData = normalizePluginData(await this.storage.loadData());
				const previous = latestData.incomingConceptMerge === undefined ? undefined
					: readIncomingConceptMergeReceipt(latestData.incomingConceptMerge);
				if (previous?.operationId === plan.receipt.operationId) {
					const resumed = await this.finishPending(latestData, previous);
					return resumed.status === "merged" ? { status: "merged" }
						: { status: "conflict", message: "Merge was not applied. Rebuild and review the preview before confirming again." };
				}
				if (previous?.status === "pending") throw new Error(INCOMING_MERGE_RESUME_MESSAGE);
				if (await this.vault.read(plan.existing.path) !== plan.before) throw new MarkdownWriteConflict(plan.existing.path);
				if (JSON.stringify(latestData) !== plan.dataSnapshot) {
					return {
						message: "Mneme state changed after preview. Return to editing and rebuild the preview.",
						status: "conflict",
					};
				}
				const receipt = readIncomingConceptMergeReceipt(plan.receipt);
				if (receipt.status !== "pending" || receipt.path !== plan.existing.path
					|| receipt.conceptId !== plan.existing.conceptId
					|| await incomingMergeMarkdownHash(plan.before) !== receipt.beforeHash
					|| await incomingMergeMarkdownHash(plan.after) !== receipt.afterHash
					|| await incomingMergeOriginHash(latestData, receipt.origin) !== receipt.origin.inputHash) {
					throw new Error("The Merge preview changed. Rebuild the preview before confirming.");
				}

				const pendingData = { ...latestData, incomingConceptMerge: receipt };
				// A rejected save may already have persisted the intent. Never write Markdown unless it succeeds.
				await this.storage.saveData(pendingData);
				if (plan.after !== plan.before) {
					await this.vault.process(receipt.path, (current) => {
						if (current !== plan.before) throw new MarkdownWriteConflict(receipt.path);
						return plan.after;
					});
				}
				const finished = await this.finishPending(pendingData, receipt, false);
				return finished.status === "merged" ? { status: "merged" }
					: { status: "conflict", message: "Merge was not applied. Rebuild and review the preview before confirming again." };
			} catch (error) {
				return mergeFailure(error);
			}
		});
	}

	async resume(): Promise<ResumeIncomingConceptMergeResult> {
		return runPluginDataMutation(this.storage, async () => {
			try {
				const data = normalizePluginData(await this.storage.loadData());
				if (data.incomingConceptMerge === undefined) return { status: "none" };
				return await this.finishPending(data, readIncomingConceptMergeReceipt(data.incomingConceptMerge));
			} catch (error) {
				return mergeFailure(error);
			}
		});
	}

	private async finishPending(
		data: MnemePluginData,
		receipt: IncomingConceptMergeReceipt,
		recovering = true,
	): Promise<{ status: "merged"; receipt: IncomingConceptMergeReceipt; manualDraftId?: string } | { status: "not-applied" }> {
		const completed = { status: "merged" as const, receipt: { ...receipt, status: "written" as const },
			...(receipt.origin.kind === "manual" && receipt.origin.draftId ? { manualDraftId: receipt.origin.draftId } : {}) };
		if (receipt.status === "written") return completed;
		if (receipt.status === "not-applied") return { status: "not-applied" };
		assertConceptNotDeleting(data.conceptDeletions, receipt.conceptId);
		assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, receipt.conceptId);
		assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt.path);
		assertCardDeletionAllowsPath(data.cardDeletion, receipt.path);
		assertCardIdRepairAllowsPath(data.cardIdRepairs, receipt.path);
		assertMergeHasNoPendingWrites({ ...data, incomingConceptMerge: undefined }, [receipt.path]);
		const markdown = await this.vault.read(receipt.path);
		if (getConceptId(markdown) !== receipt.conceptId) throw new MarkdownWriteConflict(receipt.path);
		if (await incomingMergeOriginHash(data, receipt.origin) !== receipt.origin.inputHash) {
			throw new Error("The pending Merge source draft or Proposal changed. Existing Markdown and drafts were preserved.");
		}
		const hash = await incomingMergeMarkdownHash(markdown);
		if (hash !== receipt.afterHash) {
			if (hash !== receipt.beforeHash) throw new MarkdownWriteConflict(receipt.path);
			// Retain a terminal receipt so a stale confirmation cannot replay this operation.
			await this.storage.saveData({ ...data, incomingConceptMerge: { ...receipt, status: "not-applied" } });
			return { status: "not-applied" };
		}
		let nextData: MnemePluginData;
		if (receipt.origin.kind === "inbox") {
			const proposal = getInboxProposal(data, receipt.origin.proposalId);
			if (!proposal || proposal.writeReceipt !== undefined) throw new Error("The pending Merge Proposal is unavailable.");
			const links = buildConceptSourceLinksFromNewConceptProposal({ conceptId: receipt.conceptId, now: receipt.createdAt, proposal });
			nextData = mergeInboxProposalState(data, proposal, receipt.conceptId, links, receipt.createdAt);
		} else {
			const draft = data.manualConceptDraft;
			if (!draft) throw new Error("The pending Merge Composer draft is unavailable.");
			const links = buildManualConceptSourceLinks(receipt.conceptId, draft, receipt.origin.source, receipt.createdAt);
			nextData = mergeManualConceptState(data, draft, receipt.origin.source, receipt.conceptId, links, receipt.createdAt, recovering);
		}
		// Completion and source consumption share one save, so an after-save rejection is idempotent.
		await this.storage.saveData({ ...nextData, incomingConceptMerge: { ...receipt, status: "written" } });
		return completed;
	}
}

function buildManualConceptSourceLinks(
	conceptId: string,
	input: ManualConceptInput,
	source: ManualConceptSourceSnapshot | undefined,
	now: string,
): ConceptSourceLink[] {
	const sourcePath = input.sourcePath?.trim();
	if (!sourcePath) return [];
	if (!source || source.path !== sourcePath) {
		throw new Error("The Manual Concept source changed before Merge could be prepared.");
	}
	const id = createConceptSourceLinkId(conceptId, source.path, "origin");

	return [{
		addedAt: now,
		conceptId,
		evidence: [],
		id,
		lastSeenAt: now,
		relationType: "origin",
		sourceHash: source.contentHash,
		sourcePath: source.path,
		status: "approved",
	}];
}

function getInboxProposal(
	data: MnemePluginData,
	proposalId: string,
): Extract<KnowledgeProposal, { kind: "new_concept" }> | undefined {
	const proposal = data.knowledgeProposals[proposalId];
	if (
		!proposal
		|| proposal.kind !== "new_concept"
		|| !proposal.payload
		|| !["suggested", "opened", "edited", "stale", "approved"].includes(proposal.status)
	) {
		return undefined;
	}

	return proposal;
}

function mergeInboxProposalState(
	data: MnemePluginData,
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
	conceptId: string,
	sourceLinks: ReturnType<typeof buildConceptSourceLinksFromNewConceptProposal>,
	now: string,
): MnemePluginData {
	const approved = proposal.status === "approved"
		? proposal
		: applyProposalStatus(proposal, "approved", now);
	const written = applyProposalStatus(approved, "written", now);
	const conceptSourceLinks = { ...data.conceptSourceLinks };
	const conceptConflictMergeDrafts = { ...data.conceptConflictMergeDrafts };
	delete conceptConflictMergeDrafts[`inbox:${proposal.id}`];
	const sourceAnalysisRecords = { ...data.sourceAnalysisRecords };

	for (const link of sourceLinks) {
		conceptSourceLinks[link.id] = link;
		const sourceRecord = sourceAnalysisRecords[link.sourcePath];
		if (sourceRecord) {
			const mergedRecord = mergeLinkedConceptId(sourceRecord, conceptId);
			sourceAnalysisRecords[link.sourcePath] = {
				...mergedRecord,
				pendingProposalIds: mergedRecord.pendingProposalIds.filter((id) => id !== proposal.id),
			};
		}
	}

	return {
		...data,
		conceptConflictMergeDrafts,
		conceptSourceLinks,
		knowledgeProposals: {
			...data.knowledgeProposals,
			[proposal.id]: written,
		},
		sourceAnalysisRecords,
	};
}

function manualDraftMatches(
	data: MnemePluginData,
	input: ManualConceptInput & { updatedAt?: string },
): boolean {
	const stored = data.manualConceptDraft;
	if (!stored) return false;
	const inputDraftId = input.draftId;
	const storedDraftId = stored.draftId;
	if (inputDraftId !== undefined || storedDraftId !== undefined || data.manualConceptDraftId !== undefined) {
		if (!inputDraftId || !storedDraftId || !data.manualConceptDraftId
			|| inputDraftId !== storedDraftId || storedDraftId !== data.manualConceptDraftId) return false;
	}

	return stored.title === input.title
		&& stored.englishName === (input.englishName ?? "")
		&& stored.coreMeaning === input.coreMeaning
		&& stored.whyItMatters === (input.whyItMatters ?? "")
		&& stored.learningMode === (input.learningMode ?? "reviewable")
		&& stored.importance === (input.importance ?? "normal")
		&& (stored.sourcePath ?? "") === (input.sourcePath ?? "")
		&& JSON.stringify(stored.tags) === JSON.stringify(input.tags ?? [])
		&& (input.updatedAt === undefined || stored.updatedAt === input.updatedAt);
}

function mergeManualConceptState(
	data: MnemePluginData,
	input: ManualConceptInput,
	source: ManualConceptSourceSnapshot | undefined,
	conceptId: string,
	sourceLinks: ConceptSourceLink[],
	now: string,
	preserveSourceMetadata = false,
): MnemePluginData {
	const nextData: MnemePluginData = {
		...data,
		conceptConflictMergeDrafts: { ...data.conceptConflictMergeDrafts },
		conceptSourceLinks: { ...data.conceptSourceLinks },
		sourceAnalysisRecords: { ...data.sourceAnalysisRecords },
	};
	const nextDraft = createEmptyManualConceptDraft(input.sourcePath?.trim() || undefined, now);
	delete nextData.conceptConflictMergeDrafts.manual;
	nextData.manualConceptDraft = nextDraft;
	nextData.manualConceptDraftId = nextDraft.draftId;

	for (const link of sourceLinks) {
		nextData.conceptSourceLinks[link.id] = link;
		if (!source) continue;
		const previous = nextData.sourceAnalysisRecords[source.path];
		nextData.sourceAnalysisRecords[source.path] = previous
			? {
				...mergeLinkedConceptId(previous, conceptId),
				// Recovery may run after another analysis. Keep its newer metadata.
				...(preserveSourceMetadata ? {} : { contentHash: source.contentHash, mtime: source.mtime, size: source.size }),
				status: previous.contentHash === source.contentHash ? previous.status : "stale",
			}
			: {
				contentHash: source.contentHash,
				lastAnalyzedAt: now,
				linkedConceptIds: [conceptId],
				mtime: source.mtime,
				pendingProposalIds: [],
				size: source.size,
				sourcePath: source.path,
				status: "clean",
			};
	}

	return nextData;
}

function mergeFailure(error: unknown): { status: "conflict" | "failed"; message: string } {
	return {
		status: error instanceof MarkdownWriteConflict ? "conflict" : "failed",
		message: `${error instanceof Error ? error.message : "Incoming Concept Merge failed."} ${INCOMING_MERGE_RESUME_MESSAGE}`,
	};
}
