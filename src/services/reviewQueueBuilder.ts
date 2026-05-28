import { LoadedMnemeCard } from "../models/card";
import { MnemeConcept } from "../models/concept";
import {
	CardDueStatus,
	ReviewQueue,
	ReviewQueueCard,
	ReviewQueueConcept,
	ReviewQueueSummary,
} from "../models/reviewQueue";
import { CardReviewState } from "../models/reviewState";

export function buildReviewQueue(
	concepts: MnemeConcept[],
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): ReviewQueue {
	const queueConcepts = concepts.map((concept) => buildReviewQueueConcept(concept, reviewStates, now));
	const summary = summarizeReviewQueue(queueConcepts);

	return {
		concepts: queueConcepts,
		summary,
	};
}

export function buildReviewQueueConcept(
	concept: MnemeConcept,
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): ReviewQueueConcept {
	const cards = concept.cards.map((card) => buildReviewQueueCard(concept, card, reviewStates[card.cardId], now));
	const dueCards = cards.filter((card) => card.dueStatus === "due");
	const newCards = cards.filter((card) => card.dueStatus === "new");
	const notDueCards = cards.filter((card) => card.dueStatus === "not-due");
	const invalidCards = cards.filter((card) => card.dueStatus === "invalid");
	const reviewableCount = dueCards.length + newCards.length;
	const totalValidCount = dueCards.length + newCards.length + notDueCards.length;

	return {
		concept,
		conceptId: concept.id,
		dueCards,
		invalidCards,
		newCards,
		notDueCards,
		reviewableCount,
		title: concept.title,
		totalValidCount,
	};
}

export function buildReviewQueueCard(
	concept: MnemeConcept,
	card: LoadedMnemeCard,
	reviewState: CardReviewState | undefined,
	now: Date,
): ReviewQueueCard {
	const dueStatus = getCardDueStatus(card, reviewState, now);

	return {
		card,
		cardId: card.cardId,
		conceptId: concept.id,
		conceptTitle: concept.title,
		dueAt: reviewState?.dueAt,
		dueStatus,
		reviewCount: reviewState?.reviewCount ?? 0,
	};
}

export function getCardDueStatus(
	card: LoadedMnemeCard,
	reviewState: CardReviewState | undefined,
	now: Date,
): CardDueStatus {
	if (!card.isValid) {
		return "invalid";
	}

	if (!reviewState) {
		return "new";
	}

	if (!reviewState.dueAt) {
		return "due";
	}

	const dueAt = Date.parse(reviewState.dueAt);

	if (Number.isNaN(dueAt) || dueAt <= now.getTime()) {
		return "due";
	}

	return "not-due";
}

function summarizeReviewQueue(concepts: ReviewQueueConcept[]): ReviewQueueSummary {
	return {
		concepts: concepts.length,
		dueCards: concepts.reduce((count, concept) => count + concept.dueCards.length, 0),
		invalidCards: concepts.reduce((count, concept) => count + concept.invalidCards.length, 0),
		newCards: concepts.reduce((count, concept) => count + concept.newCards.length, 0),
		notDueCards: concepts.reduce((count, concept) => count + concept.notDueCards.length, 0),
		reviewableConcepts: concepts.filter((concept) => concept.reviewableCount > 0).length,
	};
}
