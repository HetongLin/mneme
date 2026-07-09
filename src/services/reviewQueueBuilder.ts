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
import { getDailyReviewEligibility } from "./dailyReviewEligibility";

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
	const cards = concept.cards.map((card) => {
		const queueCard = buildReviewQueueCard(concept, card, reviewStates[card.cardId], now);

		return concept.learningMode === "exploratory" && queueCard.dueStatus !== "invalid"
			? excludeExploratoryCard(queueCard)
			: queueCard;
	});
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

function excludeExploratoryCard(card: ReviewQueueCard): ReviewQueueCard {
	return {
		...card,
		dueStatus: "not-due",
		eligibilityReason: "exploratory-concept",
		includedInDailyReview: false,
		isDue: false,
		isNew: false,
		isOverdue: false,
	};
}

export function buildReviewQueueCard(
	concept: MnemeConcept,
	card: LoadedMnemeCard,
	reviewState: CardReviewState | undefined,
	now: Date,
): ReviewQueueCard {
	const eligibility = getDailyReviewEligibility(card, reviewState, now);
	const dueStatus = getCardDueStatus(eligibility);

	return {
		card,
		cardId: card.cardId,
		conceptId: concept.id,
		conceptTitle: concept.title,
		dueAt: eligibility.dueAt ?? reviewState?.dueAt,
		dueStatus,
		eligibilityReason: eligibility.reason,
		includedInDailyReview: eligibility.includedInDailyReview,
		isDue: eligibility.isDue,
		isNew: eligibility.isNew,
		isOverdue: eligibility.isOverdue,
		reviewCount: reviewState?.reviewCount ?? 0,
	};
}

export function getCardDueStatus(eligibility: ReturnType<typeof getDailyReviewEligibility>): CardDueStatus {
	if (eligibility.reason === "invalid" || eligibility.reason === "missing-card-id") {
		return "invalid";
	}

	if (eligibility.isNew) {
		return "new";
	}

	if (eligibility.isDue) {
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
