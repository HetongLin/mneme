import assert from "node:assert/strict";
import { CardReviewState } from "../src/models/reviewState";
import { getPlaceholderIntervalDays, PlaceholderReviewScheduler } from "../src/services/placeholderReviewScheduler";

const scheduler = new PlaceholderReviewScheduler();
const reviewedAt = "2026-01-01T12:00:00.000Z";

{
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		rating: "good",
		reviewedAt,
	});

	assert.equal(result.scheduler, "placeholder");
	assert.equal(result.intervalDays, 3);
	assert.equal(result.nextState.cardId, "encapsulation-basic");
	assert.equal(result.nextState.reviewCount, 1);
	assert.equal(result.nextState.lastRating, "good");
	assert.equal(result.nextState.lastReviewedAt, reviewedAt);
	assert.equal(result.nextState.dueAt, "2026-01-04T12:00:00.000Z");
	assert.equal(result.nextState.scheduler, "placeholder");
}

{
	const previousState = createReviewState("encapsulation-basic", {
		lapseCount: 2,
		reviewCount: 4,
	});
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState,
		rating: "again",
		reviewedAt,
	});

	assert.equal(result.intervalDays, 0);
	assert.equal(result.nextState.dueAt, reviewedAt);
	assert.equal(result.nextState.lapseCount, 3);
	assert.equal(result.nextState.reviewCount, 5);
}

{
	assert.equal(getPlaceholderIntervalDays("hard") < getPlaceholderIntervalDays("good"), true);
	assert.equal(getPlaceholderIntervalDays("good") < getPlaceholderIntervalDays("easy"), true);
}

{
	const previousState = createReviewState("encapsulation-basic", {
		createdAt: "2025-12-01T12:00:00.000Z",
		reviewCount: 2,
	});
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState,
		rating: "easy",
		reviewedAt,
	});

	assert.equal(result.nextState.createdAt, "2025-12-01T12:00:00.000Z");
	assert.equal(result.nextState.updatedAt, reviewedAt);
	assert.equal(result.nextState.reviewCount, 3);
}

{
	const result = scheduler.schedule({
		cardId: "card-only-memory",
		rating: "hard",
		reviewedAt,
	});

	assert.equal(result.nextState.cardId, "card-only-memory");
	assert.equal(result.nextState.dueAt, "2026-01-02T12:00:00.000Z");
}

function createReviewState(cardId: string, overrides: Partial<CardReviewState> = {}): CardReviewState {
	return {
		cardId,
		createdAt: "2025-12-15T12:00:00.000Z",
		dueAt: "2025-12-18T12:00:00.000Z",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2025-12-15T12:00:00.000Z",
		reviewCount: 1,
		updatedAt: "2025-12-15T12:00:00.000Z",
		...overrides,
	};
}
