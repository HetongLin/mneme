import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { MnemeConcept } from "../src/models/concept";
import { CardReviewState } from "../src/models/reviewState";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
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
	const concept = createConcept([createCard("new-card"), createCard("due-card")]);
	concept.learningMode = "exploratory";
	const state = createReviewState("due-card", "2026-01-09T12:00:00.000Z");
	const queue = buildReviewQueue([concept], { "due-card": state }, now);
	const queuedConcept = queue.concepts[0];

	assert.equal(queuedConcept?.reviewableCount, 0);
	assert.equal(queuedConcept?.dueCards.length, 0);
	assert.equal(queuedConcept?.newCards.length, 0);
	assert.equal(queuedConcept?.notDueCards.length, 2);
	assert.deepEqual(
		queuedConcept?.notDueCards.map((card) => card.eligibilityReason),
		["exploratory-concept", "exploratory-concept"],
	);
	assert.equal(state.dueAt, "2026-01-09T12:00:00.000Z");
	assert.equal(queue.summary.reviewableConcepts, 0);
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

	assert.equal(queue.concepts[0]?.notDueCards.length, 1);
	assert.equal(queue.concepts[0]?.notDueCards[0]?.eligibilityReason, "missing-due-at");
	assert.equal(queue.concepts[0]?.reviewableCount, 0);
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
	const queue = buildReviewQueue(
		[createConcept([createCard("malformed-card")])],
		{ "malformed-card": createReviewState("malformed-card", "not-a-date") },
		now,
	);
	const concept = queue.concepts[0];

	assert.equal(concept?.notDueCards.length, 1);
	assert.equal(concept?.notDueCards[0]?.eligibilityReason, "missing-due-at");
	assert.equal(concept?.reviewableCount, 0);
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
	assert.equal(concept?.newCards[0]?.includedInDailyReview, true);
	assert.equal(concept?.notDueCards.length, 1);
	assert.equal(concept?.notDueCards[0]?.includedInDailyReview, false);
	assert.equal(concept?.reviewableCount, 1);
	assert.equal(queue.summary.reviewableConcepts, 1);
}

{
	const futureCards = Array.from({ length: 3 }, (_, index) => createCard(`future-${index}`));
	const queue = buildReviewQueue(
		[createConcept([createCard("due-card"), ...futureCards])],
		{
			"due-card": createReviewState("due-card", "2026-01-09T12:00:00.000Z"),
			"future-0": createReviewState("future-0", "2026-01-12T12:00:00.000Z"),
			"future-1": createReviewState("future-1", "2026-01-13T12:00:00.000Z"),
			"future-2": createReviewState("future-2", "2026-01-14T12:00:00.000Z"),
		},
		now,
	);
	const concept = queue.concepts[0];

	assert.equal(concept?.dueCards.length, 1);
	assert.equal(concept?.notDueCards.length, 3);
	assert.equal(concept?.reviewableCount, 1);
}

{
	const scheduler = new FsrsReviewScheduler();
	const reviewed = scheduler.schedule({
		cardId: "reviewed-card",
		rating: "good",
		reviewedAt: now.toISOString(),
	}).nextState;
	const queue = buildReviewQueue(
		[createConcept([createCard("reviewed-card")])],
		{ "reviewed-card": reviewed },
		now,
	);

	assert.equal(queue.concepts[0]?.reviewableCount, 0);
	assert.equal(queue.concepts[0]?.notDueCards.length, 1);
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
