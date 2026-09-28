export type ConceptLearningMode = "reviewable" | "exploratory";
export type ConceptImportance = "low" | "normal" | "high" | "critical";

export interface ConceptSummary {
	cardCount?: number;
	/** Derived review-scan diagnostic; never persisted as Concept metadata. */
	cardReviewError?: string;
	cardsPath?: string;
	conceptId: string;
	coreMeaning?: string;
	englishName?: string;
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	path: string;
	primaryTitle?: string;
	relatedConceptIds?: string[];
	retentionTarget?: number;
	sourceCount?: number;
	tags?: string[];
	title: string;
	updatedAt?: number;
	whyItMatters?: string;
}

export type ConceptIdentityIssueKind = "missing_id" | "duplicate_id";

export interface ConceptIdentityIssue {
	cardsPath?: string;
	conceptId?: string;
	kind: ConceptIdentityIssueKind;
	path: string;
	title: string;
	updatedAt?: number;
}

export interface ConceptScanResult {
	concepts: ConceptSummary[];
	duplicateCandidates: ConceptDuplicateCandidate[];
	identityIssues: ConceptIdentityIssue[];
	staleSourceIssues: ConceptStaleSourceIssue[];
}

export interface ConceptStaleSourceIssue {
	conceptId: string;
	conceptPath: string;
	conceptTitle: string;
	link: ConceptSourceLink;
}

export interface ConceptDuplicateCandidate {
	first: ConceptSummary;
	pairKey: string;
	reasons: string[];
	score: number;
	second: ConceptSummary;
}

export interface ConceptMergeSuggestion {
	concept: ConceptSummary;
	pairKey: string;
	reasons: string[];
	score: number;
}

export interface ConceptLibraryFilter {
	importance?: "all" | ConceptImportance;
	learningMode?: "all" | ConceptLearningMode;
	query?: string;
	tag?: "all" | string;
}

export type ConceptLibrarySortMode = "title" | "updatedAt_desc" | "importance_desc";
import type { ConceptSourceLink } from "./conceptSource";
