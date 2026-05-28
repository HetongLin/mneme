import assert from "node:assert/strict";
import { ReviewScheduler, ReviewScheduleInput, ReviewScheduleResult } from "../src/models/reviewScheduler";
import { CardReviewState, MnemePluginData } from "../src/models/reviewState";
import {
	createDefaultPluginData,
	normalizePluginData,
	ReviewStateStorage,
	ReviewStateStore,
} from "../src/services/reviewStateStore";

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

async function runAsyncTests(): Promise<void> {
	{
		const storage = new MemoryReviewStateStorage();
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		const updatedState = await store.recordReview("encapsulation-basic", "good");

		assert.equal(scheduler.lastInput?.cardId, "encapsulation-basic");
		assert.equal(scheduler.lastInput?.rating, "good");
		assert.equal(scheduler.lastInput?.previousState, undefined);
		assert.equal(updatedState.cardId, "encapsulation-basic");
		assert.equal(updatedState.reviewCount, 1);
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], updatedState);
		assert.deepEqual(store.getState("encapsulation-basic"), updatedState);
	}

	{
		const previousState = createReviewState("encapsulation-basic", 2);
		const storage = new MemoryReviewStateStorage({
			reviewStates: {
				"encapsulation-basic": previousState,
			},
			schemaVersion: 1,
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		const updatedState = await store.recordReview("encapsulation-basic", "again");

		assert.deepEqual(scheduler.lastInput?.previousState, previousState);
		assert.equal(updatedState.reviewCount, 3);
		assert.equal(updatedState.lapseCount, 1);
		assert.equal(updatedState.lastRating, "again");
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], updatedState);
	}
}

class FakeReviewScheduler implements ReviewScheduler {
	lastInput?: ReviewScheduleInput;

	schedule(input: ReviewScheduleInput): ReviewScheduleResult {
		this.lastInput = input;
		const previousState = input.previousState;
		const nextState: CardReviewState = {
			cardId: input.cardId,
			createdAt: previousState?.createdAt ?? input.reviewedAt,
			dueAt: input.reviewedAt,
			lapseCount: (previousState?.lapseCount ?? 0) + (input.rating === "again" ? 1 : 0),
			lastRating: input.rating,
			lastReviewedAt: input.reviewedAt,
			reviewCount: (previousState?.reviewCount ?? 0) + 1,
			scheduler: "fake",
			updatedAt: input.reviewedAt,
		};

		return {
			intervalDays: 0,
			nextState,
			scheduler: "fake",
		};
	}
}

class MemoryReviewStateStorage implements ReviewStateStorage {
	savedData?: MnemePluginData;

	constructor(private data: unknown = undefined) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.savedData = data;
		this.data = data;
	}
}

function createReviewState(cardId: string, reviewCount: number): CardReviewState {
	return {
		cardId,
		createdAt: "2026-01-01T12:00:00.000Z",
		dueAt: "2026-01-04T12:00:00.000Z",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2026-01-01T12:00:00.000Z",
		reviewCount,
		updatedAt: "2026-01-01T12:00:00.000Z",
	};
}

export const done = runAsyncTests();
