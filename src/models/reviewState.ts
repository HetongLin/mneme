import type { MnemeSettings } from "./settings";
import type { SourceAnalysisRecord } from "./sourceAnalysis";
import type { KnowledgeProposal } from "./knowledgeProposal";
import type { ConceptSourceLink } from "./conceptSource";
import type { ManualConceptDraft } from "./manualConceptDraft";
import type { ManualCardDraft } from "./manualCardDraft";
import type { ManualCardWriteReceipt } from "./manualCardWrite";
import type { ManualConceptWriteReceipt } from "./manualConceptWrite";
import type { ConceptConflictMergeDraftRecord } from "./conceptConflictMergeDraft";

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

export interface ConceptReviewPause {
	conceptId: string;
	pausedAt: string;
}

export interface CardReviewSuspension {
	cardId: string;
	suspendedAt: string;
}

export interface CardRetirement {
	cardId: string;
	retiredAt: string;
}

export interface CardReviewEvent {
	cardId: string;
	eventId: string;
	rating: ReviewRating;
	reviewedAt: string;
}

export interface CardTombstone {
	cardId: string;
	deletedAt: string;
	lapseCount: number;
	reviewCount: number;
}

export interface ConceptDuplicateDismissal {
	conceptIds: [string, string];
	dismissedAt: string;
	pairKey: string;
}

export interface ConceptMergeRecord {
	mergedAt: string;
	mergedConceptId: string;
	mergedPath: string;
	survivorConceptId: string;
	survivorPath: string;
}

export interface MnemePluginData {
	[key: string]: unknown;
	reviewStates: Record<string, CardReviewState>;
	reviewDeferrals: Record<string, ReviewDeferral>;
	pausedConcepts: Record<string, ConceptReviewPause>;
	reviewEvents: Record<string, CardReviewEvent>;
	retiredCards: Record<string, CardRetirement>;
	suspendedCards: Record<string, CardReviewSuspension>;
	cardTombstones: Record<string, CardTombstone>;
	conceptDuplicateDismissals: Record<string, ConceptDuplicateDismissal>;
	conceptConflictMergeDrafts: Record<string, ConceptConflictMergeDraftRecord>;
	conceptMergeRecords: Record<string, ConceptMergeRecord>;
	schemaVersion: number;
	settings: MnemeSettings;
	sourceAnalysisRecords: Record<string, SourceAnalysisRecord>;
	knowledgeProposals: Record<string, KnowledgeProposal>;
	conceptSourceLinks: Record<string, ConceptSourceLink>;
	manualCardDraft?: ManualCardDraft;
	manualCardDraftId?: string;
	manualCardWrite?: ManualCardWriteReceipt;
	manualConceptDraft?: ManualConceptDraft;
	manualConceptDraftId?: string;
	manualConceptWrite?: ManualConceptWriteReceipt;
}
