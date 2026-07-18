import { CARD_DRAFT_TYPES, type CardDraftType } from "../models/knowledgeProposal";

export const CARD_TYPE_LABELS: Record<CardDraftType, string> = {
	application: "Application",
	definition: "Definition",
	distinction: "Distinction",
	example: "Example",
	mastery: "Mastery",
	other: "Other",
	procedure: "Procedure",
	proof: "Proof",
	trap: "Trap",
};

export const CARD_TYPE_DESCRIPTIONS: Record<CardDraftType, string> = {
	application: "Use the Concept in a new situation.",
	definition: "Ask what the Concept means.",
	distinction: "Compare or contrast Concepts.",
	example: "Interpret a concrete case.",
	mastery: "Synthesize across multiple ideas.",
	other: "Fallback when no specific type fits.",
	procedure: "Ask for steps, calculation, or method.",
	proof: "Ask for derivation, justification, or theorem logic.",
	trap: "Ask about a misconception or common error.",
};

export function formatCardTypeLabel(value: string | undefined): string {
	return isCardDraftType(value) ? CARD_TYPE_LABELS[value] : "Other";
}

export function getCardTypeOptions(types: readonly CardDraftType[] = CARD_DRAFT_TYPES): Array<[CardDraftType, string]> {
	return types.map((type) => [type, CARD_TYPE_LABELS[type]]);
}

function isCardDraftType(value: string | undefined): value is CardDraftType {
	return CARD_DRAFT_TYPES.some((type) => type === value);
}
