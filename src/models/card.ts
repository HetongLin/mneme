import type { CardDraftType } from "./knowledgeProposal";

export interface LoadedMnemeCard {
	back: string;
	basename: string;
	cardId: string;
	cardIndex: number;
	cardType?: CardDraftType;
	content: string;
	errors: string[];
	front: string;
	hasExplicitCardId: boolean;
	id: string;
	isValid: boolean;
	path: string;
	rubric?: string;
	warnings: string[];
}
