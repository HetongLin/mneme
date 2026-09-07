import { createEmptyManualConceptDraft, type ManualConceptDraft } from "../models/manualConceptDraft";
import type { ManualConceptWriteReceipt } from "../models/manualConceptWrite";
import type { MnemePluginData } from "../models/reviewState";
import { computeContentHash } from "../utils/sourceHash";

export function isConceptDraftId(value: unknown): value is string {
	return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function manualConceptDraftHash(draft: ManualConceptDraft): Promise<string> {
	return computeContentHash(JSON.stringify({
		draftId: draft.draftId, title: draft.title.trim(), englishName: draft.englishName.trim(),
		coreMeaning: draft.coreMeaning.trim(), whyItMatters: draft.whyItMatters.trim(),
		importance: draft.importance, learningMode: draft.learningMode, tags: draft.tags,
		sourcePath: draft.sourcePath?.trim() || undefined,
	}));
}

export function readManualConceptWriteReceipt(value: unknown): ManualConceptWriteReceipt {
	if (!value || typeof value !== "object") throw new Error("The saved Concept creation record is invalid.");
	const receipt = value as Record<string, unknown>;
	const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
	const path = (value: unknown) => typeof value === "string" && /\.md$/i.test(value)
		&& !/^(?:[\\/]|[a-z]:)/i.test(value) && !/(^|[\\/])\.\.?([\\/]|$)|[\r\n]/.test(value);
	const source = receipt.source as Record<string, unknown> | undefined;
	if (receipt.version !== 1 || !isConceptDraftId(receipt.draftId)
		|| !hash(receipt.inputHash) || !hash(receipt.afterHash)
		|| typeof receipt.conceptId !== "string" || !receipt.conceptId.trim() || /[\s<>"']/.test(receipt.conceptId)
		|| !path(receipt.path) || !path(receipt.cardsPath)
		|| typeof receipt.englishAliasesEnabled !== "boolean"
		|| !["pending", "written"].includes(String(receipt.status))
		|| typeof receipt.createdAt !== "string" || Number.isNaN(Date.parse(receipt.createdAt))
		|| (source !== undefined && (!source || typeof source !== "object" || !path(source.path) || !hash(source.contentHash)
			|| typeof source.mtime !== "number" || !Number.isFinite(source.mtime) || source.mtime < 0
			|| typeof source.size !== "number" || !Number.isFinite(source.size) || source.size < 0))) {
		throw new Error("The saved Concept creation record is invalid. Existing Markdown was preserved.");
	}
	return value as ManualConceptWriteReceipt;
}

export function readCurrentManualConceptDraft(data: MnemePluginData): ManualConceptDraft {
	if (!isConceptDraftId(data.manualConceptDraftId)
		|| (data.manualConceptDraft && data.manualConceptDraft.draftId !== data.manualConceptDraftId)) {
		throw new Error("The saved Composer draft identity is invalid. Reopen Concept Composer before continuing.");
	}
	return data.manualConceptDraft ? { ...data.manualConceptDraft, tags: [...data.manualConceptDraft.tags] }
		: createEmptyManualConceptDraft(undefined, undefined, data.manualConceptDraftId);
}
