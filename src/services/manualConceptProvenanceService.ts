import type { MnemePluginData } from "../models/reviewState";
import type { ManualConceptSourceSnapshot } from "../models/manualConceptWrite";
import type { ManualConceptCommitter, ManualConceptInput, ManualConceptResult } from "./manualConceptService";
import { createConceptSourceLinkId } from "./conceptSourceLinking";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export type { ManualConceptSourceSnapshot } from "../models/manualConceptWrite";

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
			await this.storage.saveData(withManualConceptProvenance(data, result, this.source, now));
		});
	}
}

export function withManualConceptProvenance(
	data: MnemePluginData,
	result: ManualConceptResult,
	source: ManualConceptSourceSnapshot,
	now: string,
): MnemePluginData {
	const linkId = createConceptSourceLinkId(result.conceptId, source.path, "origin");
	const previous = data.sourceAnalysisRecords[source.path];
	const sourceRecord = previous
		? {
			...previous,
			contentHash: source.contentHash,
			linkedConceptIds: unique([...previous.linkedConceptIds, result.conceptId]),
			mtime: source.mtime,
			size: source.size,
			status: previous.contentHash === source.contentHash ? previous.status : "stale" as const,
		}
		: {
			contentHash: source.contentHash,
			lastAnalyzedAt: now,
			linkedConceptIds: [result.conceptId],
			mtime: source.mtime,
			pendingProposalIds: [],
			size: source.size,
			sourcePath: source.path,
			status: "clean" as const,
		};

	return {
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
				sourceHash: source.contentHash,
				sourcePath: source.path,
				status: "approved",
			},
		},
		sourceAnalysisRecords: {
			...data.sourceAnalysisRecords,
			[source.path]: sourceRecord,
		},
	};
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
