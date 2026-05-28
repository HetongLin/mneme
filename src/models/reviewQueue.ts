import { LoadedMnemeCard } from "./card";
import { MnemeConcept } from "./concept";

export type CardDueStatus = "new" | "due" | "not-due" | "invalid";

export interface ReviewQueueCard {
	card: LoadedMnemeCard;
	cardId: string;
	conceptId: string;
	conceptTitle: string;
	dueAt?: string;
	dueStatus: CardDueStatus;
	reviewCount: number;
}

export interface ReviewQueueConcept {
	concept: MnemeConcept;
	conceptId: string;
	dueCards: ReviewQueueCard[];
	invalidCards: ReviewQueueCard[];
	newCards: ReviewQueueCard[];
	notDueCards: ReviewQueueCard[];
	reviewableCount: number;
	title: string;
	totalValidCount: number;
}

export interface ReviewQueueSummary {
	concepts: number;
	dueCards: number;
	invalidCards: number;
	newCards: number;
	notDueCards: number;
	reviewableConcepts: number;
}

export interface ReviewQueue {
	concepts: ReviewQueueConcept[];
	summary: ReviewQueueSummary;
}
