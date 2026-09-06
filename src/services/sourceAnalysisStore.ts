import type { MnemePluginData } from "../models/reviewState";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface SourceAnalysisStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class SourceAnalysisStore {
	constructor(private readonly storage: SourceAnalysisStorage) {
	}

	async loadRecords(): Promise<Record<string, SourceAnalysisRecord>> {
		const data = await this.loadPluginData();

		return { ...data.sourceAnalysisRecords };
	}

	async getRecord(sourcePath: string): Promise<SourceAnalysisRecord | undefined> {
		const records = await this.loadRecords();

		return records[sourcePath];
	}

	async upsertRecord(record: SourceAnalysisRecord): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const nextData = {
				...data,
				sourceAnalysisRecords: {
					...data.sourceAnalysisRecords,
					[record.sourcePath]: record,
				},
			};

			await this.storage.saveData(nextData);
		});
	}

	async moveRecord(previousPath: string, record: SourceAnalysisRecord): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const sourceAnalysisRecords = { ...data.sourceAnalysisRecords };

			if (previousPath !== record.sourcePath) {
				delete sourceAnalysisRecords[previousPath];
			}
			sourceAnalysisRecords[record.sourcePath] = record;

			await this.storage.saveData({
				...data,
				sourceAnalysisRecords,
			});
		});
	}

	async removeRecord(sourcePath: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			if (!(sourcePath in data.sourceAnalysisRecords)) return;

			const sourceAnalysisRecords = { ...data.sourceAnalysisRecords };
			delete sourceAnalysisRecords[sourcePath];

			await this.storage.saveData({
				...data,
				sourceAnalysisRecords,
			});
		});
	}

	async replaceRecords(records: Record<string, SourceAnalysisRecord>): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

			await this.storage.saveData({
				...data,
				sourceAnalysisRecords: { ...records },
			});
		});
	}

	async listRecords(): Promise<SourceAnalysisRecord[]> {
		return Object.values(await this.loadRecords());
	}

	async clearRecords(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

			await this.storage.saveData({
				...data,
				sourceAnalysisRecords: {},
			});
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
