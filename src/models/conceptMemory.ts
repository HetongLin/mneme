import { CardDueStatus } from "./reviewQueue";
import { ReviewRating } from "./reviewState";

export type ConceptPriorityBand = "high" | "medium" | "low";

export interface CardMemoryRisk {
	cardId: string;
	dueAt?: string;
	dueStatus: CardDueStatus;
	lapseCount: number;
	lastRating?: ReviewRating;
	reviewCount: number;
	risk: number;
}

export interface ConceptMemorySummary {
	averageRisk: number;
	cardRisks: CardMemoryRisk[];
	conceptId: string;
	dueCardCount: number;
	dueRatio: number;
	invalidCardCount: number;
	lapseRatio: number;
	newCardCount: number;
	newRatio: number;
	notDueCardCount: number;
	priorityBand: ConceptPriorityBand;
	priorityScore: number;
	title: string;
	topK: number;
	topKAvgRisk: number;
	validCardCount: number;
	weakestRisk: number;
}
