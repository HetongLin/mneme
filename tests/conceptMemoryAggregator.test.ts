import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { MnemeConcept } from "../src/models/concept";
import { ReviewQueueCard, ReviewQueueConcept } from "../src/models/reviewQueue";
import { CardReviewState } from "../src/models/reviewState";
import {
	aggregateReviewQueueConcept,
	calculateTopK,
	getImportanceWeight,
	getPriorityBand,
} from "../src/services/conceptMemoryAggregator";

const now = new Date("2026-01-10T12:00:00.000Z");

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		newCards: [createQueueCard("new-card", "new")],
	}), {}, now);

	assert.equal(summary.newCardCount, 1);
	assert.equal(summary.cardRisks[0]?.risk, 0.85);
	assert.equal(summary.reviewCardCount, 1);
	assert.deepEqual(summary.includedReviewCardIds, ["new-card"]);
	assert.equal(summary.priorityScore > 0, true);
}

{
	const definition = createQueueCard("definition-card", "due");
	definition.card.front = "Define encapsulation.";
	definition.card.cardType = "definition";
	const application = createQueueCard("application-card", "due");
	application.card.front = "Apply encapsulation to this design.";
	application.card.cardType = "application";
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [definition, application],
	}), {}, now);

	assert.equal(summary.assessmentCoverage, "multiple");
	assert.equal(summary.assessmentProbeCount, 2);
	assert.deepEqual(summary.coveredCardTypes, ["definition", "application"]);
}

{
	const concept = createQueueConcept({
		dueCards: [createQueueCard("rotation-card", "due")],
	});
	const recentlyReviewed = aggregateReviewQueueConcept(concept, {
		"rotation-card": createReviewState("rotation-card", {
			lastReviewedAt: "2026-01-10T11:00:00.000Z",
		}),
	}, now);
	const longUnseen = aggregateReviewQueueConcept(concept, {
		"rotation-card": createReviewState("rotation-card", {
			lastReviewedAt: "2025-12-01T12:00:00.000Z",
		}),
	}, now);

	assert.equal(longUnseen.rotationBoost, 0.08);
	assert.equal(longUnseen.reviewPriorityScore > recentlyReviewed.reviewPriorityScore, true);
}

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("active", "due"), createQueueCard("retired", "due")],
	}), {}, now, new Set(["retired"]));

	assert.equal(summary.totalCardCount, 1);
	assert.equal(summary.dueCardCount, 1);
	assert.deepEqual(summary.cardRisks.map((card) => card.cardId), ["active"]);
}

{
	const criticalConcept = createQueueConcept({
		dueCards: [createQueueCard("critical-card", "due")],
	});
	criticalConcept.concept.importance = "critical";
	const lowConcept = createQueueConcept({
		dueCards: [createQueueCard("low-card", "due")],
	});
	lowConcept.concept.importance = "low";
	const critical = aggregateReviewQueueConcept(criticalConcept, {}, now);
	const low = aggregateReviewQueueConcept(lowConcept, {}, now);

	assert.equal(critical.importance, "critical");
	assert.equal(critical.importanceWeight, 1);
	assert.equal(low.importanceWeight, 0.15);
	assert.equal(critical.reviewPriorityScore > low.reviewPriorityScore, true);
	assert.equal(getImportanceWeight(undefined), 0.5);
}

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("due-card", "due")],
	}), {}, now);

	assert.equal(summary.dueCardCount, 1);
	assert.equal(summary.cardRisks[0]?.risk, 0.75);
	assert.equal(summary.reviewCardCount, 1);
	assert.equal(summary.priorityScore > 0, true);
}

{
	const dueSummary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("due-card", "due")],
	}), {}, now);
	const notDueSummary = aggregateReviewQueueConcept(createQueueConcept({
		notDueCards: [createQueueCard("later-card", "not-due", "2026-01-15T12:00:00.000Z")],
	}), {}, now);

	assert.equal((notDueSummary.cardRisks[0]?.risk ?? 0) < (dueSummary.cardRisks[0]?.risk ?? 0), true);
}

{
	assert.equal(calculateTopK(1), 1);
	assert.equal(calculateTopK(8), 2);
	assert.equal(calculateTopK(20), 5);
}

{
	const notDueCards = Array.from({ length: 7 }, (_, index) => {
		return createQueueCard(`later-${index}`, "not-due", "2026-01-20T12:00:00.000Z");
	});
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("due-card", "due")],
		notDueCards,
	}), {}, now);

	assert.equal(summary.validCardCount, 8);
	assert.equal(summary.reviewCardCount, 1);
	assert.equal(summary.topK, 2);
	assert.equal(summary.topKAvgRisk > summary.averageRisk, true);
	assert.equal(summary.priorityScore, summary.reviewPriorityScore);
}

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		invalidCards: [createQueueCard("invalid-card", "invalid")],
	}), {}, now);

	assert.equal(summary.validCardCount, 0);
	assert.equal(summary.reviewCardCount, 0);
	assert.equal(summary.priorityScore, 0);
	assert.equal(summary.priorityBand, "low");
}

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("again-card", "due")],
	}), {
		"again-card": createReviewState("again-card", {
			lapseCount: 1,
			lastRating: "again",
		}),
	}, now);

	assert.equal(summary.lapseRatio, 1);
	assert.equal(summary.cardRisks[0]?.risk, 0.85);
}

{
	assert.equal(getPriorityBand(0.70), "high");
	assert.equal(getPriorityBand(0.40), "medium");
	assert.equal(getPriorityBand(0.39), "low");
}

function createQueueConcept(cards: {
	dueCards?: ReviewQueueCard[];
	invalidCards?: ReviewQueueCard[];
	newCards?: ReviewQueueCard[];
	notDueCards?: ReviewQueueCard[];
}): ReviewQueueConcept {
	const dueCards = cards.dueCards ?? [];
	const newCards = cards.newCards ?? [];
	const notDueCards = cards.notDueCards ?? [];
	const invalidCards = cards.invalidCards ?? [];

	return {
		concept: createConcept([
			...dueCards,
			...newCards,
			...notDueCards,
			...invalidCards,
		].map((card) => card.card)),
		conceptId: "Concepts/Encapsulation",
		dueCards,
		invalidCards,
		newCards,
		notDueCards,
		reviewableCount: dueCards.length + newCards.length,
		title: "Encapsulation",
		totalValidCount: dueCards.length + newCards.length + notDueCards.length,
	};
}

function createConcept(cards: LoadedMnemeCard[]): MnemeConcept {
	return {
		cards,
		errors: [],
		folderPath: "Concepts/Encapsulation",
		id: "Concepts/Encapsulation",
		isReviewable: cards.some((card) => card.isValid),
		title: "Encapsulation",
		warnings: [],
	};
}

function createQueueCard(cardId: string, dueStatus: ReviewQueueCard["dueStatus"], dueAt?: string): ReviewQueueCard {
	return {
		card: createCard(cardId, dueStatus !== "invalid"),
		cardId,
		conceptId: "Concepts/Encapsulation",
		conceptTitle: "Encapsulation",
		dueAt,
		dueStatus,
		eligibilityReason: dueStatus,
		includedInDailyReview: dueStatus === "due" || dueStatus === "new",
		isDue: dueStatus === "due",
		isNew: dueStatus === "new",
		isOverdue: dueStatus === "due" && dueAt !== now.toISOString(),
		reviewCount: dueStatus === "new" ? 0 : 1,
	};
}

function createCard(cardId: string, isValid: boolean): LoadedMnemeCard {
	return {
		back: "Back",
		basename: "Card",
		cardId,
		cardIndex: 0,
		content: "",
		errors: isValid ? [] : ["Invalid card"],
		front: "Front",
		hasExplicitCardId: true,
		id: cardId,
		isValid,
		path: "Concepts/Encapsulation/Card.md",
		warnings: [],
	};
}

function createReviewState(cardId: string, overrides: Partial<CardReviewState> = {}): CardReviewState {
	return {
		cardId,
		createdAt: "2026-01-01T12:00:00.000Z",
		dueAt: "2026-01-10T12:00:00.000Z",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2026-01-01T12:00:00.000Z",
		reviewCount: 1,
		updatedAt: "2026-01-01T12:00:00.000Z",
		...overrides,
	};
}
