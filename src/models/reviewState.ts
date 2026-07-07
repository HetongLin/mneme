import type { MnemeSettings } from "./settings";
import type { SourceAnalysisRecord } from "./sourceAnalysis";
import type { KnowledgeProposal } from "./knowledgeProposal";
import type { ConceptSourceLink } from "./conceptSource";

export type ReviewRating = "again" | "hard" | "good" | "easy";
export type FsrsCardState = "New" | "Learning" | "Review" | "Relearning";

export interface CardReviewState {
	cardId: string;
	createdAt: string;
	difficulty?: number;
	dueAt?: string;
	elapsedDays?: number;
	fsrsState?: FsrsCardState;
	learningSteps?: number;
	lapseCount: number;
	lastRating?: ReviewRating;
	lastReviewedAt?: string;
	reviewCount: number;
	scheduledDays?: number;
	scheduler?: string;
	schedulerVersion?: string;
	stability?: number;
	updatedAt: string;
}

export interface ReviewDeferral {
	cardId: string;
	deferredAt: string;
	resumeAt: string;
}

export interface MnemePluginData {
	[key: string]: unknown;
	reviewStates: Record<string, CardReviewState>;
	reviewDeferrals: Record<string, ReviewDeferral>;
	schemaVersion: number;
	settings: MnemeSettings;
	sourceAnalysisRecords: Record<string, SourceAnalysisRecord>;
	knowledgeProposals: Record<string, KnowledgeProposal>;
	conceptSourceLinks: Record<string, ConceptSourceLink>;
}
