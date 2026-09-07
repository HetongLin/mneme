import { createEmptyManualCardDraft, type ManualCardDraft } from "../models/manualCardDraft";
import type { ManualCardWriteReceipt } from "../models/manualCardWrite";
import type { MnemePluginData } from "../models/reviewState";
import { computeContentHash } from "../utils/sourceHash";

export function manualCardDraftHash(draft: ManualCardDraft): Promise<string> {
	return computeContentHash(JSON.stringify({
		draftId: draft.draftId, conceptId: draft.conceptId, cardType: draft.cardType,
		front: draft.front.trim(), back: draft.back.trim(), rubric: draft.rubric.trim(),
	}));
}

export function isDraftId(value: unknown): value is string {
	return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function readManualCardWriteReceipt(value: unknown): ManualCardWriteReceipt {
	if (!value || typeof value !== "object") throw new Error("The saved Card creation record is invalid.");
	const receipt = value as Record<string, unknown>;
	const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
	const id = (value: unknown) => typeof value === "string" && !!value.trim() && !/[\s<>"']/.test(value);
	const path = (value: unknown) => typeof value === "string" && /\.md$/i.test(value)
		&& !/^(?:[\\/]|[a-z]:)/i.test(value) && !/(^|[\\/])\.\.?([\\/]|$)|[\r\n]/.test(value);
	if (receipt.version !== 1 || !isDraftId(receipt.draftId)
		|| !hash(receipt.inputHash) || !hash(receipt.afterHash)
		|| !id(receipt.cardId) || !id(receipt.conceptId)
		|| !path(receipt.cardsPath) || !path(receipt.conceptPath)
		|| typeof receipt.conceptTitle !== "string" || !receipt.conceptTitle.trim()
		|| typeof receipt.targetExisted !== "boolean"
		|| !["pending", "written"].includes(String(receipt.status))
		|| typeof receipt.createdAt !== "string" || Number.isNaN(Date.parse(receipt.createdAt))) {
		throw new Error("The saved Card creation record is invalid. Existing Markdown was preserved.");
	}
	return value as ManualCardWriteReceipt;
}

/** Identity is retained even when the editable draft is empty or cleared. */
export function readCurrentManualCardDraft(data: MnemePluginData): ManualCardDraft {
	if (!isDraftId(data.manualCardDraftId)
		|| (data.manualCardDraft && data.manualCardDraft.draftId !== data.manualCardDraftId)) {
		throw new Error("The saved Composer draft identity is invalid. Reopen Card Composer before continuing.");
	}
	return data.manualCardDraft ? { ...data.manualCardDraft }
		: createEmptyManualCardDraft(undefined, undefined, data.manualCardDraftId);
}
