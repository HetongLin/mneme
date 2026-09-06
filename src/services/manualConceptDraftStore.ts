import type { ManualConceptDraft } from "../models/manualConceptDraft";
import type { MnemePluginData } from "../models/reviewState";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface ManualConceptDraftStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ManualConceptDraftStore {
	constructor(private readonly storage: ManualConceptDraftStorage) {
	}

	async getDraft(): Promise<ManualConceptDraft | undefined> {
		const draft = (await this.loadPluginData()).manualConceptDraft;

		return draft ? cloneDraft(draft) : undefined;
	}

	async saveDraft(draft: ManualConceptDraft): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

			await this.storage.saveData({
				...data,
				manualConceptDraft: cloneDraft(draft),
			});
		});
	}

	async clearDraft(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const nextData = { ...data };
			delete nextData.manualConceptDraft;
			await this.storage.saveData(nextData);
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}

function cloneDraft(draft: ManualConceptDraft): ManualConceptDraft {
	return { ...draft, tags: [...draft.tags] };
}
