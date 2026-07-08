import type { ConceptStaleSourceIssue } from "../models/conceptLibrary";
import type { MnemePluginData } from "../models/reviewState";
import { normalizeVaultPath } from "../utils/markdownPath";
import { removeConceptSourceEntry } from "./conceptSourceRemover";
import { normalizePluginData } from "./reviewStateStore";

export interface SourceProvenanceRemovalVault {
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

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
		try {
			if (await this.vault.read(plan.issue.conceptPath) !== plan.conceptBefore) {
				return { message: "Concept.md changed after preview.", status: "conflict" };
			}
			const latestData = normalizePluginData(await this.storage.loadData());
			if (JSON.stringify(latestData) !== plan.dataSnapshot) {
				return { message: "Mneme state changed after preview.", status: "conflict" };
			}
			let markdownWritten = false;
			let dataWriteAttempted = false;
			try {
				if (plan.conceptAfter !== plan.conceptBefore) {
					await this.vault.modify(plan.issue.conceptPath, plan.conceptAfter);
					markdownWritten = true;
				}
				dataWriteAttempted = true;
				await this.storage.saveData(plan.nextData);
			} catch (error) {
				const rollbackErrors: string[] = [];
				if (markdownWritten) {
					try { await this.vault.modify(plan.issue.conceptPath, plan.conceptBefore); }
					catch (rollbackError) { rollbackErrors.push(`Concept.md: ${formatError(rollbackError)}`); }
				}
				if (dataWriteAttempted) {
					try { await this.storage.saveData(latestData); }
					catch (rollbackError) { rollbackErrors.push(`plugin data: ${formatError(rollbackError)}`); }
				}
				throw new Error(`${formatError(error)}${rollbackErrors.length ? ` Rollback also failed: ${rollbackErrors.join("; ")}` : ""}`);
			}
			return { status: "removed" };
		} catch (error) {
			return { message: formatError(error), status: "failed" };
		}
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
