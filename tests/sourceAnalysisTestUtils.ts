import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { SourceAnalysisRecord } from "../src/models/sourceAnalysis";
import type { SourceAnalysisStorage } from "../src/services/sourceAnalysisStore";

export class MemorySourceAnalysisStorage implements SourceAnalysisStorage {
	savedData?: MnemePluginData;

	constructor(private data: unknown) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.savedData = data;
		this.data = data;
	}
}

export function createPluginData(
	sourceAnalysisRecords: Record<string, SourceAnalysisRecord> = {},
): MnemePluginData {
	return {
		reviewStates: {},
		schemaVersion: 1,
		settings: DEFAULT_SETTINGS,
		sourceAnalysisRecords,
	};
}

export function createRecord(
	sourcePath: string,
	overrides: Partial<SourceAnalysisRecord> = {},
): SourceAnalysisRecord {
	return {
		contentHash: "previous-hash",
		lastAnalyzedAt: "2026-01-01T12:00:00.000Z",
		linkedConceptIds: [],
		mtime: 100,
		pendingProposalIds: [],
		size: 200,
		sourcePath,
		status: "clean",
		...overrides,
	};
}
