import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { CardReviewState } from "../src/models/reviewState";
import {
	getDailyReviewEligibility,
	isCardDueForDailyReview,
	isNewCardReviewState,
} from "../src/services/dailyReviewEligibility";

const now = new Date("2026-01-10T12:00:00.000Z");

{
	const eligibility = getDailyReviewEligibility(createCard("future-fsrs"), createReviewState("future-fsrs", {
		dueAt: "2026-01-11T12:00:00.000Z",
		scheduler: "fsrs",
	}), now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "not-due");
}

{
	const eligibility = getDailyReviewEligibility(createCard("due-fsrs"), createReviewState("due-fsrs", {
		dueAt: now.toISOString(),
		scheduler: "fsrs",
	}), now);

	assert.equal(eligibility.includedInDailyReview, true);
	assert.equal(eligibility.isDue, true);
	assert.equal(eligibility.reason, "due");
}

{
	const eligibility = getDailyReviewEligibility(createCard("new-card"), undefined, now);

	assert.equal(isNewCardReviewState(undefined), true);
	assert.equal(eligibility.includedInDailyReview, true);
	assert.equal(eligibility.isNew, true);
	assert.equal(eligibility.reason, "new");
}

{
	const eligibility = getDailyReviewEligibility(createCard("legacy-fallback", true, false), undefined, now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.isNew, false);
	assert.equal(eligibility.reason, "missing-card-id");
}

{
	const eligibility = getDailyReviewEligibility(
		createCard("legacy-reviewed", true, false),
		createReviewState("legacy-reviewed", {
			dueAt: "2026-01-09T12:00:00.000Z",
		}),
		now,
	);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.isDue, false);
	assert.equal(eligibility.reason, "missing-card-id");
}

{
	const eligibility = getDailyReviewEligibility(createCard("invalid-card", false), undefined, now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "invalid");
}

{
	const eligibility = getDailyReviewEligibility(createCard("malformed-due"), createReviewState("malformed-due", {
		dueAt: "not-a-date",
	}), now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "missing-due-at");
}

{
	const pastState = createReviewState("past-placeholder", {
		dueAt: "2026-01-09T12:00:00.000Z",
		scheduler: "placeholder",
	});

	assert.equal(isCardDueForDailyReview(pastState, now), true);
	assert.equal(getDailyReviewEligibility(createCard("past-placeholder"), pastState, now).includedInDailyReview, true);
}

{
	const futureState = createReviewState("future-placeholder", {
		dueAt: "2026-01-11T12:00:00.000Z",
		scheduler: "placeholder",
	});

	assert.equal(isCardDueForDailyReview(futureState, now), false);
	assert.equal(getDailyReviewEligibility(createCard("future-placeholder"), futureState, now).includedInDailyReview, false);
}

{
	const missingDueAtState = createReviewState("missing-due-at", {
		dueAt: undefined,
	});
	const eligibility = getDailyReviewEligibility(createCard("missing-due-at"), missingDueAtState, now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "missing-due-at");
}

function createCard(cardId: string, isValid = true, hasExplicitCardId = true): LoadedMnemeCard {
	return {
		back: "Back",
		basename: "Card",
		cardId,
		cardIndex: 0,
		content: "",
		errors: isValid ? [] : ["Invalid card"],
		front: "Front",
		hasExplicitCardId,
		id: cardId,
		isValid,
		path: "Concept/Card.md",
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
