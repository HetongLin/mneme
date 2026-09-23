import type { MnemePluginData } from "../models/reviewState";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { getPendingGuidedConceptMerge } from "./guidedConceptMergeRecovery";
import { normalizeVaultPath } from "../utils/markdownPath";

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

	/** Apply scan observations only while each observed record is still current. */
	async reconcileRecordsIfUnchanged(
		observations: Array<{ record: SourceAnalysisRecord; sourceExists: boolean }>,
	): Promise<string[]> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const records = { ...data.sourceAnalysisRecords };
			const guided = getPendingGuidedConceptMerge(data);
			const guidedPath = (path: string) => guided?.protectedPaths.some((protectedPath) =>
				normalizeVaultPath(protectedPath) === normalizeVaultPath(path)) ?? false;
			const guidedConcept = (ids: string[], sourcePath: string) => guided !== undefined
				&& (ids.some((id) => id === guided.survivor.conceptId || id === guided.merged.conceptId)
					|| Object.values(data.conceptSourceLinks).some((link) =>
						normalizeVaultPath(link.sourcePath) === normalizeVaultPath(sourcePath)
							&& (link.conceptId === guided.survivor.conceptId || link.conceptId === guided.merged.conceptId)));
			const removedPaths: string[] = [];
			let changed = false;
			for (const { record: expected, sourceExists } of observations) {
				const current = records[expected.sourcePath];
				if (!current || JSON.stringify(current) !== JSON.stringify(expected)) continue;
				if (!sourceExists) {
					if (guidedPath(current.sourcePath) || guidedConcept(current.linkedConceptIds, current.sourcePath)) continue;
					delete records[current.sourcePath];
					removedPaths.push(current.sourcePath);
					changed = true;
					continue;
				}
				// Proposal membership may have changed since the scan began.
				const pendingProposalIds = current.pendingProposalIds.filter((id) => Object.prototype.hasOwnProperty.call(data.knowledgeProposals, id));
				if (pendingProposalIds.length !== current.pendingProposalIds.length) {
					records[current.sourcePath] = { ...current, pendingProposalIds };
					changed = true;
				}
			}
			if (changed) await this.storage.saveData({ ...data, sourceAnalysisRecords: records });
			return removedPaths;
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
