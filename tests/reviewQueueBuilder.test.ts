import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { MnemeConcept } from "../src/models/concept";
import { CardReviewState } from "../src/models/reviewState";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";

const now = new Date("2026-01-10T12:00:00.000Z");

{
	const queue = buildReviewQueue([createConcept([createCard("new-card")])], {}, now);
	const concept = queue.concepts[0];

	assert.equal(concept?.newCards.length, 1);
	assert.equal(concept?.reviewableCount, 1);
	assert.equal(queue.summary.newCards, 1);
	assert.equal(queue.summary.reviewableConcepts, 1);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("past-card")])],
		{ "past-card": createReviewState("past-card", "2026-01-09T12:00:00.000Z") },
		now,
	);
	const concept = queue.concepts[0];

	assert.equal(concept?.dueCards.length, 1);
	assert.equal(concept?.reviewableCount, 1);
	assert.equal(queue.summary.dueCards, 1);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("missing-due-card")])],
		{ "missing-due-card": createReviewState("missing-due-card") },
		now,
	);

	assert.equal(queue.concepts[0]?.dueCards.length, 1);
	assert.equal(queue.concepts[0]?.reviewableCount, 1);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("now-card")])],
		{ "now-card": createReviewState("now-card", now.toISOString()) },
		now,
	);

	assert.equal(queue.concepts[0]?.dueCards.length, 1);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("future-card")])],
		{ "future-card": createReviewState("future-card", "2026-01-11T12:00:00.000Z") },
		now,
	);
	const concept = queue.concepts[0];

	assert.equal(concept?.notDueCards.length, 1);
	assert.equal(concept?.reviewableCount, 0);
	assert.equal(queue.summary.notDueCards, 1);
	assert.equal(queue.summary.reviewableConcepts, 0);
}

{
	const queue = buildReviewQueue([createConcept([createCard("invalid-card", false)])], {}, now);
	const concept = queue.concepts[0];

	assert.equal(concept?.invalidCards.length, 1);
	assert.equal(concept?.reviewableCount, 0);
	assert.equal(queue.summary.invalidCards, 1);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("later-only")])],
		{ "later-only": createReviewState("later-only", "2026-01-12T12:00:00.000Z") },
		now,
	);

	assert.equal(queue.concepts[0]?.reviewableCount, 0);
	assert.equal(queue.summary.reviewableConcepts, 0);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("new-card"), createCard("later-card")])],
		{ "later-card": createReviewState("later-card", "2026-01-12T12:00:00.000Z") },
		now,
	);
	const concept = queue.concepts[0];

	assert.equal(concept?.newCards.length, 1);
	assert.equal(concept?.notDueCards.length, 1);
	assert.equal(concept?.reviewableCount, 1);
	assert.equal(queue.summary.reviewableConcepts, 1);
}

function createConcept(cards: LoadedMnemeCard[]): MnemeConcept {
	return {
		cards,
		errors: [],
		folderPath: "Concepts/Encapsulation",
		id: "Concepts/Encapsulation",
		isReviewable: true,
		title: "Encapsulation",
		warnings: [],
	};
}

function createCard(cardId: string, isValid = true): LoadedMnemeCard {
	return {
		back: "Back",
		basename: "Card",
		cardId,
		cardIndex: 0,
		content: "",
		errors: isValid ? [] : ["Missing BACK section."],
		front: "Front",
		hasExplicitCardId: true,
		id: cardId,
		isValid,
		path: "Concepts/Encapsulation/Card.md",
		warnings: [],
	};
}

function createReviewState(cardId: string, dueAt?: string): CardReviewState {
	return {
		cardId,
		createdAt: "2026-01-01T12:00:00.000Z",
		dueAt,
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2026-01-01T12:00:00.000Z",
		reviewCount: 1,
		updatedAt: "2026-01-01T12:00:00.000Z",
	};
}
