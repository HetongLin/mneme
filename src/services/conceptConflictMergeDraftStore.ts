import type { ConceptConflictMergeDraftRecord } from "../models/conceptConflictMergeDraft";
import type { MnemePluginData } from "../models/reviewState";
import { normalizePluginData } from "./reviewStateStore";

export interface ConceptConflictMergeDraftStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ConceptConflictMergeDraftStore {
	constructor(private readonly storage: ConceptConflictMergeDraftStorage) {
	}

	async getDraft(key: string): Promise<ConceptConflictMergeDraftRecord | undefined> {
		const data = normalizePluginData(await this.storage.loadData());
		const record = data.conceptConflictMergeDrafts[key];

		return record ? cloneRecord(record) : undefined;
	}

	async saveDraft(record: ConceptConflictMergeDraftRecord): Promise<void> {
		const data = normalizePluginData(await this.storage.loadData());

		await this.storage.saveData({
			...data,
			conceptConflictMergeDrafts: {
				...data.conceptConflictMergeDrafts,
				[record.key]: cloneRecord(record),
			},
		});
	}

	async clearDraft(key: string): Promise<void> {
		const data = normalizePluginData(await this.storage.loadData());
		const conceptConflictMergeDrafts = { ...data.conceptConflictMergeDrafts };
		delete conceptConflictMergeDrafts[key];

		await this.storage.saveData({
			...data,
			conceptConflictMergeDrafts,
		});
	}
}

function cloneRecord(record: ConceptConflictMergeDraftRecord): ConceptConflictMergeDraftRecord {
	return {
		...record,
		draft: {
			...record.draft,
			tags: [...record.draft.tags],
		},
	};
}
