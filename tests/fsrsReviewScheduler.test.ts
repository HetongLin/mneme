import assert from "node:assert/strict";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
import { CardReviewState } from "../src/models/reviewState";
import {
	cardReviewStateToFsrsCard,
	FsrsReviewScheduler,
	fsrsCardToCardReviewState,
	mapMnemeRatingToFsrsRating,
} from "../src/services/fsrsReviewScheduler";

const reviewedAt = "2026-01-01T12:00:00.000Z";

{
	assert.equal(mapMnemeRatingToFsrsRating("again"), Rating.Again);
	assert.equal(mapMnemeRatingToFsrsRating("hard"), Rating.Hard);
	assert.equal(mapMnemeRatingToFsrsRating("good"), Rating.Good);
	assert.equal(mapMnemeRatingToFsrsRating("easy"), Rating.Easy);
}

{
	const scheduler = new FsrsReviewScheduler();
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		rating: "good",
		reviewedAt,
	});

	assert.equal(result.scheduler, "fsrs");
	assert.equal(result.nextState.scheduler, "fsrs");
	assert.equal(result.nextState.cardId, "encapsulation-basic");
	assert.equal(result.nextState.reviewCount >= 1, true);
	assert.equal(typeof result.nextState.dueAt, "string");
	assert.equal(typeof result.nextState.stability, "number");
	assert.equal(typeof result.nextState.difficulty, "number");
	assert.equal(typeof result.nextState.fsrsState, "string");
	assert.equal(result.nextState.lastRating, "good");
}

{
	const scheduler = new FsrsReviewScheduler();
	const first = scheduler.schedule({
		cardId: "encapsulation-basic",
		rating: "good",
		reviewedAt: "2026-01-01T00:00:00.000Z",
	}).nextState;
	const second = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState: first,
		rating: "good",
		reviewedAt: first.dueAt ?? "2026-01-01T00:10:00.000Z",
	}).nextState;
	const again = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState: second,
		rating: "again",
		reviewedAt: second.dueAt ?? "2026-01-03T00:10:00.000Z",
	}).nextState;

	assert.equal(again.lapseCount > second.lapseCount, true);
	assert.equal(again.lastRating, "again");
}

{
	const scheduler = new FsrsReviewScheduler();
	const previousState = createFsrsReviewState("encapsulation-basic", {
		createdAt: "2025-12-01T12:00:00.000Z",
		updatedAt: "2025-12-01T12:00:00.000Z",
	});
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState,
		rating: "easy",
		reviewedAt,
	});

	assert.equal(result.nextState.createdAt, "2025-12-01T12:00:00.000Z");
	assert.equal(result.nextState.updatedAt, reviewedAt);
	assert.equal(result.nextState.reviewCount, previousState.reviewCount + 1);
}

{
	const scheduler = new FsrsReviewScheduler();
	const placeholderState: CardReviewState = {
		cardId: "encapsulation-basic",
		createdAt: "2025-12-01T12:00:00.000Z",
		dueAt: "2025-12-08T12:00:00.000Z",
		lapseCount: 12,
		lastRating: "good",
		lastReviewedAt: "2025-12-01T12:00:00.000Z",
		reviewCount: 99,
		scheduler: "placeholder",
		updatedAt: "2025-12-01T12:00:00.000Z",
	};
	const result = scheduler.schedule({
		cardId: "encapsulation-basic",
		previousState: placeholderState,
		rating: "good",
		reviewedAt,
	});

	assert.equal(result.nextState.createdAt, placeholderState.createdAt);
	assert.equal(result.nextState.reviewCount, 1);
	assert.equal(result.nextState.lapseCount, 0);
	assert.equal(result.nextState.scheduler, "fsrs");
}

{
	const scheduler = new FsrsReviewScheduler();
	const input = {
		cardId: "deterministic-card",
		rating: "good" as const,
		reviewedAt,
	};

	assert.deepEqual(scheduler.schedule(input), scheduler.schedule(input));
}

{
	const scheduler = fsrs({ enable_fuzz: false });
	const card = createEmptyCard(new Date(reviewedAt));
	const fsrsCard = scheduler.next(card, new Date(reviewedAt), Rating.Good).card;
	const state = fsrsCardToCardReviewState("encapsulation-basic", fsrsCard, "good", undefined, reviewedAt);

	assert.equal(state.dueAt, fsrsCard.due.toISOString());
	assert.equal(state.lastReviewedAt, fsrsCard.last_review?.toISOString());
	assert.equal(state.scheduler, "fsrs");
}

{
	const state = createFsrsReviewState("encapsulation-basic");
	const fsrsCard = cardReviewStateToFsrsCard("encapsulation-basic", state, reviewedAt);

	assert.equal(fsrsCard.reps, state.reviewCount);
	assert.equal(fsrsCard.lapses, state.lapseCount);
	assert.equal(fsrsCard.due.toISOString(), state.dueAt);
	assert.equal(fsrsCard.last_review?.toISOString(), state.lastReviewedAt);
}

function createFsrsReviewState(cardId: string, overrides: Partial<CardReviewState> = {}): CardReviewState {
	return {
		cardId,
		createdAt: "2025-12-15T12:00:00.000Z",
		difficulty: 2.11121424,
		dueAt: "2026-01-03T00:10:00.000Z",
		elapsedDays: 0,
		fsrsState: "Review",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2026-01-01T00:10:00.000Z",
		learningSteps: 0,
		reviewCount: 2,
		scheduledDays: 2,
		scheduler: "fsrs",
		schedulerVersion: "ts-fsrs",
		stability: 2.3065,
		updatedAt: "2026-01-01T00:10:00.000Z",
		...overrides,
	};
}
