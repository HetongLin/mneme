import { LoadedMnemeCard } from "./card";
import type { ConceptImportance, ConceptLearningMode } from "./conceptLibrary";

export interface MnemeConcept {
	cardPath?: string;
	cards: LoadedMnemeCard[];
	conceptPath?: string;
	errors: string[];
	folderPath: string;
	id: string;
	importance?: ConceptImportance;
	isReviewable: boolean;
	learningMode?: ConceptLearningMode;
	sourcePath?: string;
	title: string;
	warnings: string[];
}

export interface ConceptLoadSummary {
	concepts: number;
	invalidCards: number;
	reviewableConcepts: number;
	scannedCards: number;
	validCards: number;
}

export interface LoadedMnemeConcepts {
	concepts: MnemeConcept[];
	summary: ConceptLoadSummary;
}
