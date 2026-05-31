export type ConceptLearningMode = "reviewable" | "exploratory";
export type ConceptImportance = "low" | "normal" | "high" | "critical";

export interface ConceptSummary {
	cardCount?: number;
	cardsPath?: string;
	conceptId: string;
	coreMeaning?: string;
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	path: string;
	sourceCount?: number;
	title: string;
	updatedAt?: number;
	whyItMatters?: string;
}

export interface ConceptLibraryFilter {
	importance?: "all" | ConceptImportance;
	learningMode?: "all" | ConceptLearningMode;
	query?: string;
}

export type ConceptLibrarySortMode = "title" | "updatedAt_desc" | "importance_desc";
