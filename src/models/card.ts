export interface LoadedMnemeCard {
	back: string;
	basename: string;
	cardId: string;
	cardIndex: number;
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
