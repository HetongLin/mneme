import { CardDueStatus } from "./reviewQueue";
import { ReviewRating } from "./reviewState";
import type { DailyReviewEligibilityReason } from "./dailyReview";
import type { ConceptImportance } from "./conceptLibrary";
import type { CardDraftType } from "./knowledgeProposal";

export type ConceptPriorityBand = "high" | "medium" | "low";
export type CardMemoryRiskSource = "fsrs" | "placeholder";

export interface CardMemoryRisk {
	cardId: string;
	dueAt?: string;
	dueStatus: CardDueStatus;
	eligibilityReason: DailyReviewEligibilityReason;
	includedInDailyReview: boolean;
	isDue: boolean;
	isNew: boolean;
	isOverdue: boolean;
	lapseCount: number;
	lastRating?: ReviewRating;
	reviewCount: number;
	retrievability?: number;
	risk: number;
	riskSource: CardMemoryRiskSource;
}

export interface ConceptMemorySummary {
	assessmentCoverage: "none" | "limited" | "multiple";
	assessmentProbeCount: number;
	averageRisk: number;
	cardRisks: CardMemoryRisk[];
	conceptId: string;
	coveredCardTypes: CardDraftType[];
	dueCardCount: number;
	dueRatio: number;
	earliestDueAt?: string;
	includedReviewCardIds: string[];
	importance?: ConceptImportance;
	importanceWeight: number;
	invalidCardCount: number;
	lapseRatio: number;
	newCardCount: number;
	newRatio: number;
	nextDueAt?: string;
	notDueCardCount: number;
	overdueCardCount: number;
	priorityBand: ConceptPriorityBand;
	priorityScore: number;
	reviewCardCount: number;
	reviewPriorityScore: number;
	rotationBoost: number;
	title: string;
	topK: number;
	topKAvgRisk: number;
	totalCardCount: number;
	validCardCount: number;
	weakestRisk: number;
}
