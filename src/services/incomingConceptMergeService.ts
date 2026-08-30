import type { ConceptSummary } from "../models/conceptLibrary";
import type { ConceptSourceLink } from "../models/conceptSource";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { MnemePluginData } from "../models/reviewState";
import type { ManualConceptSourceSnapshot } from "./manualConceptProvenanceService";
import type { ManualConceptInput } from "./manualConceptService";
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

export interface IncomingConceptMergeVault {
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

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
	nextData: MnemePluginData;
	sourceLinksAdded: number;
	viewsAdded: number;
}

export type PrepareIncomingConceptMergeResult =
	| { message: string; status: "blocked" }
	| { plan: IncomingConceptMergePlan; status: "ready" };

export type ExecuteIncomingConceptMergeResult =
	| { status: "merged" }
	| { message: string; status: "conflict" | "failed" };

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
			const before = await this.vault.read(input.existing.path);
			if (!hasConceptIdentity(before, input.existing.conceptId)) {
				return {
					message: "The existing Concept identity changed. Return to the conflict options and try again.",
					status: "blocked",
				};
			}

			const now = this.now();
			let sourceLinks: ConceptSourceLink[];
			let views: NonNullable<Extract<KnowledgeProposal, { kind: "new_concept" }>["payload"]>["proposedViews"];
			let nextData: MnemePluginData;

			if (input.origin.kind === "inbox") {
				const proposal = getInboxProposal(data, input.origin.proposalId);
				if (!proposal) {
					return {
						message: "The incoming Inbox proposal is no longer available for Merge.",
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
				nextData = mergeInboxProposalState(
					data,
					proposal,
					input.existing.conceptId,
					sourceLinks,
					now,
				);
			} else {
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
				nextData = mergeManualConceptState(
					data,
					input.origin.input,
					input.origin.source,
					input.existing.conceptId,
					sourceLinks,
					now,
				);
			}
			let after = applyConceptMergeDraft(before, input.draft);

			for (const view of views) {
				after = appendConceptView(after, view).markdown;
			}
			for (const link of sourceLinks) {
				after = appendConceptSourceNote(after, link).markdown;
			}

			return {
				plan: {
					after,
					before,
					dataSnapshot: JSON.stringify(data),
					existing: input.existing,
					nextData,
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
		try {
			if (await this.vault.read(plan.existing.path) !== plan.before) {
				return {
					message: `${plan.existing.path} changed after preview. Return to editing and rebuild the preview.`,
					status: "conflict",
				};
			}
			const latestData = normalizePluginData(await this.storage.loadData());
			if (JSON.stringify(latestData) !== plan.dataSnapshot) {
				return {
					message: "Mneme state changed after preview. Return to editing and rebuild the preview.",
					status: "conflict",
				};
			}

			await this.vault.modify(plan.existing.path, plan.after);
			try {
				await this.storage.saveData(plan.nextData);
			} catch (error) {
				const rollbackErrors: string[] = [];
				try {
					if (await this.vault.read(plan.existing.path) === plan.after) {
						await this.vault.modify(plan.existing.path, plan.before);
					} else {
						rollbackErrors.push(`${plan.existing.path} changed after Mneme wrote it`);
					}
				} catch (rollbackError) {
					rollbackErrors.push(
						`${plan.existing.path}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
					);
				}
				try {
					await this.storage.saveData(latestData);
				} catch (rollbackError) {
					rollbackErrors.push(
						`plugin data: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
					);
				}
				if (rollbackErrors.length > 0) {
					throw new Error([
						error instanceof Error ? error.message : String(error),
						`Rollback also failed: ${rollbackErrors.join("; ")}`,
					].join(" "));
				}
				throw error;
			}

			return { status: "merged" };
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Incoming Concept Merge failed.",
				status: "failed",
			};
		}
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
): MnemePluginData {
	const nextData: MnemePluginData = {
		...data,
		conceptConflictMergeDrafts: { ...data.conceptConflictMergeDrafts },
		conceptSourceLinks: { ...data.conceptSourceLinks },
		sourceAnalysisRecords: { ...data.sourceAnalysisRecords },
	};
	delete nextData.conceptConflictMergeDrafts.manual;
	delete nextData.manualConceptDraft;

	for (const link of sourceLinks) {
		nextData.conceptSourceLinks[link.id] = link;
		if (!source) continue;
		const previous = nextData.sourceAnalysisRecords[source.path];
		nextData.sourceAnalysisRecords[source.path] = previous
			? {
				...mergeLinkedConceptId(previous, conceptId),
				contentHash: source.contentHash,
				mtime: source.mtime,
				size: source.size,
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

function hasConceptIdentity(markdown: string, conceptId: string): boolean {
	const escaped = conceptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^mneme_id:\\s*["']?${escaped}["']?\\s*$`, "m").test(markdown);
}
