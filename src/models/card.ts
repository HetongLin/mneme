export interface LoadedMnemeCard {
	back: string;
	basename: string;
	cardIndex: number;
	content: string;
	errors: string[];
	front: string;
	id: string;
	isValid: boolean;
	path: string;
	rubric?: string;
	warnings: string[];
}
