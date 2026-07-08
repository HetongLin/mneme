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

export interface ConceptLibraryFilter {
	importance?: "all" | ConceptImportance;
	learningMode?: "all" | ConceptLearningMode;
	query?: string;
}

export type ConceptLibrarySortMode = "title" | "updatedAt_desc" | "importance_desc";
import type { ConceptSourceLink } from "./conceptSource";
