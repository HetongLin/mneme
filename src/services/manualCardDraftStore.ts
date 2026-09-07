import { createEmptyManualCardDraft, type ManualCardDraft } from "../models/manualCardDraft";
import type { ManualCardWriteReceipt } from "../models/manualCardWrite";
import type { MnemePluginData } from "../models/reviewState";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { isDraftId, readCurrentManualCardDraft, readManualCardWriteReceipt } from "./manualCardWriteRecovery";

export interface ManualCardDraftStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ManualCardDraftStore {
	constructor(private readonly storage: ManualCardDraftStorage) {
	}

	async getDraft(): Promise<ManualCardDraft> {
		return (await this.getState()).draft;
	}

	async getState(): Promise<{ draft: ManualCardDraft; pendingWrite?: ManualCardWriteReceipt }> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const receipt = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
			// Migrate legacy drafts once, before exposing editable content to a View.
			if (data.manualCardDraftId === undefined && !receipt) {
				data.manualCardDraftId = data.manualCardDraft?.draftId ?? createEmptyManualCardDraft().draftId;
				if (!isDraftId(data.manualCardDraftId)) throw new Error("The saved Composer draft identity is invalid.");
				if (data.manualCardDraft) data.manualCardDraft = { ...data.manualCardDraft, draftId: data.manualCardDraftId };
				await this.storage.saveData(data);
			}
			const draft = readCurrentManualCardDraft(data);
			if (receipt?.status === "pending"
				&& (receipt.draftId !== draft.draftId || !data.manualCardDraft)) {
				throw new Error("The pending Card creation draft is missing or has changed. Existing Markdown was preserved.");
			}
			return { draft, ...(receipt?.status === "pending" ? { pendingWrite: { ...receipt } } : {}) };
		});
	}

	async saveDraft(draft: ManualCardDraft): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			this.assertEditable(data, draft.draftId);
			await this.storage.saveData({ ...data, manualCardDraft: { ...draft } });
		});
	}

	async clearDraft(draftId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			this.assertEditable(data, draftId);
			const nextData = { ...data };
			delete nextData.manualCardDraft;
			await this.storage.saveData(nextData);
		});
	}

	private assertEditable(data: MnemePluginData, draftId: string | undefined): void {
		const receipt = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		if (receipt?.status === "pending") throw new Error("Resume the pending Card creation before editing the draft.");
		if (!isDraftId(draftId) || draftId !== readCurrentManualCardDraft(data).draftId) {
			throw new Error("This Composer draft is out of date. Reopen Card Composer before editing.");
		}
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
