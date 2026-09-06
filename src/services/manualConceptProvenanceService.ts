import type { MnemePluginData } from "../models/reviewState";
import type { ManualConceptCommitter, ManualConceptInput, ManualConceptResult } from "./manualConceptService";
import { createConceptSourceLinkId } from "./conceptSourceLinking";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface ManualConceptSourceSnapshot {
	contentHash: string;
	mtime: number;
	path: string;
	size: number;
}

export interface ManualConceptProvenanceStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ManualConceptProvenanceCommitter implements ManualConceptCommitter {
	constructor(
		private readonly storage: ManualConceptProvenanceStorage,
		private readonly source: ManualConceptSourceSnapshot,
		private readonly timestampProvider: () => string = () => new Date().toISOString(),
	) {
	}

	async commit(input: ManualConceptInput, result: ManualConceptResult): Promise<void> {
		if (!input.sourcePath || input.sourcePath !== this.source.path) {
			throw new Error("Manual Concept source changed before provenance could be saved.");
		}

		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const now = this.timestampProvider();
			const linkId = createConceptSourceLinkId(result.conceptId, this.source.path, "origin");
			const previous = data.sourceAnalysisRecords[this.source.path];
			const sourceRecord = previous
				? {
					...previous,
					contentHash: this.source.contentHash,
					linkedConceptIds: unique([...previous.linkedConceptIds, result.conceptId]),
					mtime: this.source.mtime,
					size: this.source.size,
					status: previous.contentHash === this.source.contentHash ? previous.status : "stale" as const,
				}
				: {
					contentHash: this.source.contentHash,
					lastAnalyzedAt: now,
					linkedConceptIds: [result.conceptId],
					mtime: this.source.mtime,
					pendingProposalIds: [],
					size: this.source.size,
					sourcePath: this.source.path,
					status: "clean" as const,
				};

			await this.storage.saveData({
				...data,
				conceptSourceLinks: {
					...data.conceptSourceLinks,
					[linkId]: {
						addedAt: now,
						conceptId: result.conceptId,
						evidence: [],
						id: linkId,
						lastSeenAt: now,
						relationType: "origin",
						sourceHash: this.source.contentHash,
						sourcePath: this.source.path,
						status: "approved",
					},
				},
				sourceAnalysisRecords: {
					...data.sourceAnalysisRecords,
					[this.source.path]: sourceRecord,
				},
			});
		});
	}
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
