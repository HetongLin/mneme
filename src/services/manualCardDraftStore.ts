import type { ManualCardDraft } from "../models/manualCardDraft";
import type { MnemePluginData } from "../models/reviewState";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface ManualCardDraftStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ManualCardDraftStore {
	constructor(private readonly storage: ManualCardDraftStorage) {
	}

	async getDraft(): Promise<ManualCardDraft | undefined> {
		const draft = (await this.loadPluginData()).manualCardDraft;
		return draft ? { ...draft } : undefined;
	}

	async saveDraft(draft: ManualCardDraft): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			await this.storage.saveData({ ...data, manualCardDraft: { ...draft } });
		});
	}

	async clearDraft(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const nextData = { ...data };
			delete nextData.manualCardDraft;
			await this.storage.saveData(nextData);
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
