import { createEmptyManualConceptDraft, type ManualConceptDraft } from "../models/manualConceptDraft";
import type { ManualConceptWriteReceipt } from "../models/manualConceptWrite";
import type { MnemePluginData } from "../models/reviewState";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { isConceptDraftId, readCurrentManualConceptDraft, readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import { assertIncomingMergeAllowsOrigin } from "./incomingConceptMergeRecovery";

export interface ManualConceptDraftStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ManualConceptDraftStore {
	constructor(private readonly storage: ManualConceptDraftStorage) {
	}

	async getDraft(): Promise<ManualConceptDraft> {
		return (await this.getState()).draft;
	}

	async getState(): Promise<{ draft: ManualConceptDraft; pendingWrite?: ManualConceptWriteReceipt }> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			// Check this before legacy identity migration: a pending merge owns the source draft.
			assertIncomingMergeAllowsOrigin(data, { kind: "manual" });
			const receipt = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
			// Migrate legacy drafts once, before exposing editable content to a View.
			if (data.manualConceptDraftId === undefined && !receipt) {
				data.manualConceptDraftId = data.manualConceptDraft?.draftId ?? createEmptyManualConceptDraft().draftId;
				if (!isConceptDraftId(data.manualConceptDraftId)) throw new Error("The saved Composer draft identity is invalid.");
				if (data.manualConceptDraft) data.manualConceptDraft = { ...data.manualConceptDraft, draftId: data.manualConceptDraftId };
				await this.storage.saveData(data);
			}
			const draft = readCurrentManualConceptDraft(data);
			if (receipt?.status === "pending"
				&& (receipt.draftId !== draft.draftId || !data.manualConceptDraft)) {
				throw new Error("The pending Concept creation draft is missing or has changed. Existing Markdown was preserved.");
			}
			return { draft, ...(receipt?.status === "pending" ? { pendingWrite: { ...receipt } } : {}) };
		});
	}

	async saveDraft(draft: ManualConceptDraft): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			assertIncomingMergeAllowsOrigin(data, { kind: "manual" });
			this.assertEditable(data, draft.draftId);
			await this.storage.saveData({ ...data, manualConceptDraft: { ...draft, tags: [...draft.tags] } });
		});
	}

	async clearDraft(draftId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			assertIncomingMergeAllowsOrigin(data, { kind: "manual" });
			this.assertEditable(data, draftId);
			const nextData = { ...data };
			delete nextData.manualConceptDraft;
			await this.storage.saveData(nextData);
		});
	}

	private assertEditable(data: MnemePluginData, draftId: string | undefined): void {
		const receipt = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
		if (receipt?.status === "pending") throw new Error("Resume the pending Concept creation before editing the draft.");
		if (!isConceptDraftId(draftId) || draftId !== readCurrentManualConceptDraft(data).draftId) {
			throw new Error("This Composer draft is out of date. Reopen Concept Composer before editing.");
		}
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
