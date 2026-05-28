import assert from "node:assert/strict";
import { ReviewRating } from "../src/models/reviewState";
import {
	applyReviewRating,
	calculatePlaceholderDueAt,
	createDefaultPluginData,
	createInitialReviewState,
	normalizePluginData,
} from "../src/services/reviewStateStore";

const baseNow = new Date("2026-01-01T12:00:00.000Z");

{
	const data = createDefaultPluginData();

	assert.equal(data.schemaVersion, 1);
	assert.deepEqual(data.reviewStates, {});
}

{
	const data = normalizePluginData(undefined);

	assert.equal(data.schemaVersion, 1);
	assert.deepEqual(data.reviewStates, {});
}

{
	const initialState = createInitialReviewState("encapsulation-basic", baseNow);
	const reviewedState = applyReviewRating(initialState, "good", baseNow);

	assert.equal(reviewedState.cardId, "encapsulation-basic");
	assert.equal(reviewedState.reviewCount, 1);
	assert.equal(reviewedState.lapseCount, 0);
	assert.equal(reviewedState.lastRating, "good");
	assert.equal(reviewedState.lastReviewedAt, baseNow.toISOString());
	assert.equal(reviewedState.dueAt, "2026-01-04T12:00:00.000Z");
}

{
	const initialState = createInitialReviewState("encapsulation-basic", baseNow);
	const reviewedState = applyReviewRating(initialState, "again", baseNow);

	assert.equal(reviewedState.reviewCount, 1);
	assert.equal(reviewedState.lapseCount, 1);
	assert.equal(reviewedState.dueAt, baseNow.toISOString());
}

{
	const initialState = createInitialReviewState("encapsulation-basic", baseNow);
	const secondNow = new Date("2026-01-02T12:00:00.000Z");
	const firstReview = applyReviewRating(initialState, "hard", baseNow);
	const secondReview = applyReviewRating(firstReview, "easy", secondNow);

	assert.equal(secondReview.createdAt, baseNow.toISOString());
	assert.equal(secondReview.updatedAt, secondNow.toISOString());
	assert.equal(secondReview.reviewCount, 2);
	assert.equal(secondReview.lapseCount, 0);
	assert.equal(secondReview.lastRating, "easy");
	assert.equal(secondReview.dueAt, "2026-01-09T12:00:00.000Z");
}

{
	const dueByRating: Record<ReviewRating, string> = {
		again: calculatePlaceholderDueAt("again", baseNow),
		easy: calculatePlaceholderDueAt("easy", baseNow),
		good: calculatePlaceholderDueAt("good", baseNow),
		hard: calculatePlaceholderDueAt("hard", baseNow),
	};

	assert.equal(dueByRating.again, "2026-01-01T12:00:00.000Z");
	assert.equal(dueByRating.hard, "2026-01-02T12:00:00.000Z");
	assert.equal(dueByRating.good, "2026-01-04T12:00:00.000Z");
	assert.equal(dueByRating.easy, "2026-01-08T12:00:00.000Z");
}
