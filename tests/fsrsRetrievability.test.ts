import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { MnemeConcept } from "../src/models/concept";
import { ReviewQueueCard, ReviewQueueConcept } from "../src/models/reviewQueue";
import { CardReviewState } from "../src/models/reviewState";
import { aggregateReviewQueueConcept } from "../src/services/conceptMemoryAggregator";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import {
	canEstimateFsrsRetrievability,
	clampUnitInterval,
	estimateFsrsRetrievability,
	estimateFsrsRisk,
} from "../src/services/fsrsRetrievability";

const reviewedAt = "2026-01-01T12:00:00.000Z";
const now = new Date("2026-01-02T12:00:00.000Z");

{
	const state = createReviewedFsrsState("fsrs-card");
	const retrievability = estimateFsrsRetrievability(state, now);

	assert.equal(typeof retrievability, "number");
	assert.equal((retrievability ?? -1) >= 0, true);
	assert.equal((retrievability ?? 2) <= 1, true);
}

{
	const state = createReviewedFsrsState("fsrs-card");
	const retrievability = estimateFsrsRetrievability(state, now);
	const risk = estimateFsrsRisk(state, now);

	assert.notEqual(retrievability, undefined);
	assert.notEqual(risk, undefined);
	assert.equal(risk?.risk, 1 - (retrievability ?? 0));
	assert.equal(risk?.retrievability, retrievability);
}

{
	const placeholderState = createPlaceholderState("placeholder-card");

	assert.equal(canEstimateFsrsRetrievability(placeholderState), false);
	assert.equal(estimateFsrsRetrievability(placeholderState, now), undefined);
	assert.equal(estimateFsrsRisk(placeholderState, now), undefined);
}

{
	const malformedState = createReviewedFsrsState("malformed-card", {
		stability: undefined,
	});

	assert.equal(canEstimateFsrsRetrievability(malformedState), false);
	assert.equal(estimateFsrsRisk(malformedState, now), undefined);
}

{
	assert.equal(clampUnitInterval(-0.5), 0);
	assert.equal(clampUnitInterval(0.5), 0.5);
	assert.equal(clampUnitInterval(1.5), 1);
	assert.equal(clampUnitInterval(Number.NaN), 0);
}

{
	const state = createReviewedFsrsState("fsrs-card");
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		notDueCards: [createQueueCard("fsrs-card", "not-due", state.dueAt)],
	}), {
		"fsrs-card": state,
	}, now);
	const cardRisk = summary.cardRisks[0];

	assert.equal(cardRisk?.riskSource, "fsrs");
	assert.equal(typeof cardRisk?.retrievability, "number");
	assert.equal(cardRisk?.risk, estimateFsrsRisk(state, now)?.risk);
}

{
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		notDueCards: [createQueueCard("placeholder-card", "not-due", "2026-01-10T12:00:00.000Z")],
	}), {
		"placeholder-card": createPlaceholderState("placeholder-card"),
	}, now);
	const cardRisk = summary.cardRisks[0];

	assert.equal(cardRisk?.riskSource, "placeholder");
	assert.equal(cardRisk?.retrievability, undefined);
	assert.equal(cardRisk?.risk, 0.15);
}

{
	const state = createReviewedFsrsState("fsrs-card");
	const summary = aggregateReviewQueueConcept(createQueueConcept({
		dueCards: [createQueueCard("fsrs-card", "due", state.dueAt)],
	}), {
		"fsrs-card": state,
	}, now);
	const cardRisk = summary.cardRisks[0];

	assert.equal(cardRisk?.riskSource, "fsrs");
	assert.equal(typeof cardRisk?.retrievability, "number");
}

function createReviewedFsrsState(cardId: string, overrides: Partial<CardReviewState> = {}): CardReviewState {
	const scheduler = new FsrsReviewScheduler();
	const first = scheduler.schedule({
		cardId,
		rating: "good",
		reviewedAt,
	}).nextState;
	const second = scheduler.schedule({
		cardId,
		previousState: first,
		rating: "good",
		reviewedAt: first.dueAt ?? reviewedAt,
	}).nextState;

	return {
		...second,
		...overrides,
	};
}

function createPlaceholderState(cardId: string): CardReviewState {
	return {
		cardId,
		createdAt: reviewedAt,
		dueAt: "2026-01-10T12:00:00.000Z",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: reviewedAt,
		reviewCount: 1,
		scheduler: "placeholder",
		updatedAt: reviewedAt,
	};
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
