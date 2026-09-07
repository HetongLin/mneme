import type { CardDraftType } from "./knowledgeProposal";

export interface ManualCardDraft {
	/** Missing only in drafts saved before durable creation was introduced. */
	draftId?: string;
	back: string;
	cardType: CardDraftType;
	conceptId?: string;
	front: string;
	rubric: string;
	updatedAt: string;
}

export function createEmptyManualCardDraft(
	conceptId?: string,
	updatedAt = new Date().toISOString(),
	draftId = globalThis.crypto.randomUUID(),
): ManualCardDraft {
	return {
		draftId,
		back: "",
		cardType: "definition",
		...(conceptId ? { conceptId } : {}),
		front: "",
		rubric: "",
		updatedAt,
	};
}

export function isMeaningfulManualCardDraft(draft: ManualCardDraft): boolean {
	return !!(draft.front.trim() || draft.back.trim() || draft.rubric.trim());
}
