import type { CardDraftType } from "./knowledgeProposal";

export interface ManualCardDraft {
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
): ManualCardDraft {
	return {
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
