import type { ConceptStaleSourceIssue } from "../models/conceptLibrary";
import type { MnemePluginData } from "../models/reviewState";
import { normalizeVaultPath } from "../utils/markdownPath";
import {
	executeMarkdownWriteTransaction,
	MarkdownWriteConflict,
	type TransactionalMarkdownVault,
} from "./markdownWriteTransaction";
import { runPluginDataMutation } from "./pluginDataMutation";
import { removeConceptSourceEntry } from "./conceptSourceRemover";
import { normalizePluginData } from "./reviewStateStore";
import { assertGuidedMergeAllowsTarget } from "./guidedConceptMergeRecovery";

export interface SourceProvenanceRemovalVault extends TransactionalMarkdownVault {}

export interface SourceProvenanceRemovalStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export interface SourceProvenanceRemovalPlan {
	conceptAfter: string;
	conceptBefore: string;
	dataSnapshot: string;
	issue: ConceptStaleSourceIssue;
	nextData: MnemePluginData;
	readableEntryPreserved: boolean;
	removals: number;
}

export type PrepareSourceRemovalResult =
	| { message: string; status: "blocked" }
	| { plan: SourceProvenanceRemovalPlan; status: "ready" };

export class SourceProvenanceRemovalService {
	constructor(
		private readonly vault: SourceProvenanceRemovalVault,
		private readonly storage: SourceProvenanceRemovalStorage,
	) {}

	async prepare(issue: ConceptStaleSourceIssue): Promise<PrepareSourceRemovalResult> {
		try {
			const data = normalizePluginData(await this.storage.loadData());
			assertGuidedMergeAllowsTarget(data, [issue.conceptPath, issue.link.sourcePath], [issue.conceptId]);
			const current = data.conceptSourceLinks[issue.link.id];
			if (!current || current.status !== "stale" || current.conceptId !== issue.conceptId
				|| comparablePath(current.sourcePath) !== comparablePath(issue.link.sourcePath)) {
				return { message: "Stale provenance changed. Refresh Concept Library.", status: "blocked" };
			}
			const conceptBefore = await this.vault.read(issue.conceptPath);
			if (!hasConceptIdentity(conceptBefore, issue.conceptId)) {
				return { message: "Concept identity changed. Refresh Concept Library.", status: "blocked" };
			}
			const nextLinks = { ...data.conceptSourceLinks };
			delete nextLinks[current.id];
			const readableEntryPreserved = Object.values(nextLinks).some((link) => link.conceptId === issue.conceptId
				&& comparablePath(link.sourcePath) === comparablePath(current.sourcePath));
			const removed = readableEntryPreserved
				? { markdown: conceptBefore, removals: 0 as const }
				: removeConceptSourceEntry(conceptBefore, current.sourcePath);
			const sourceAnalysisRecords = { ...data.sourceAnalysisRecords };
			const sourceRecordKey = Object.keys(sourceAnalysisRecords)
				.find((path) => comparablePath(path) === comparablePath(current.sourcePath));
			if (sourceRecordKey && !Object.values(nextLinks).some((link) => link.conceptId === issue.conceptId
				&& comparablePath(link.sourcePath) === comparablePath(current.sourcePath))) {
				const record = sourceAnalysisRecords[sourceRecordKey];
				if (record) {
					sourceAnalysisRecords[sourceRecordKey] = {
						...record,
						linkedConceptIds: record.linkedConceptIds.filter((id) => id !== issue.conceptId),
					};
				}
			}
			return {
				plan: {
					conceptAfter: removed.markdown,
					conceptBefore,
					dataSnapshot: JSON.stringify(data),
					issue,
					nextData: { ...data, conceptSourceLinks: nextLinks, sourceAnalysisRecords },
					readableEntryPreserved,
					removals: removed.removals,
				},
				status: "ready",
			};
		} catch (error) {
			return { message: formatError(error), status: "blocked" };
		}
	}

	async execute(plan: SourceProvenanceRemovalPlan): Promise<{ status: "removed" } | { message: string; status: "conflict" | "failed" }> {
		return runPluginDataMutation(this.storage, async () => {
			try {
				if (await this.vault.read(plan.issue.conceptPath) !== plan.conceptBefore) {
					return { message: "Concept.md changed after preview.", status: "conflict" };
				}
				const latestData = normalizePluginData(await this.storage.loadData());
				assertGuidedMergeAllowsTarget(latestData, [plan.issue.conceptPath, plan.issue.link.sourcePath], [plan.issue.conceptId]);
				if (JSON.stringify(latestData) !== plan.dataSnapshot) {
					return { message: "Mneme state changed after preview.", status: "conflict" };
				}
				await executeMarkdownWriteTransaction(this.vault, [{
					after: plan.conceptAfter,
					before: plan.conceptBefore,
					path: plan.issue.conceptPath,
				}], {
					commit: () => this.storage.saveData(plan.nextData),
					rollback: () => this.storage.saveData(latestData),
				});
				return { status: "removed" };
			} catch (error) {
				return {
					message: formatError(error),
					status: error instanceof MarkdownWriteConflict ? "conflict" : "failed",
				};
			}
		});
	}
}

function comparablePath(path: string): string {
	return normalizeVaultPath(path).replace(/\.md$/i, "").toLocaleLowerCase();
}

function hasConceptIdentity(markdown: string, conceptId: string): boolean {
	const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
	const ids = frontmatter?.split(/\r?\n/)
		.map((line) => line.match(/^\s*mneme_id\s*:\s*(.*?)\s*$/)?.[1])
		.filter((value): value is string => value !== undefined) ?? [];
	return ids.length === 1 && ids[0]?.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2") === conceptId;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
