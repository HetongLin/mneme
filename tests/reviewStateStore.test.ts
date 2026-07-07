import assert from "node:assert/strict";
import { ReviewScheduler, ReviewScheduleInput, ReviewScheduleResult } from "../src/models/reviewScheduler";
import { CardReviewState, MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	createDefaultPluginData,
	normalizePluginData,
	ReviewStateStorage,
	ReviewStateStore,
	startOfNextLocalDay,
} from "../src/services/reviewStateStore";

{
	const data = createDefaultPluginData();

	assert.equal(data.schemaVersion, 1);
	assert.deepEqual(data.conceptSourceLinks, {});
	assert.deepEqual(data.knowledgeProposals, {});
	assert.deepEqual(data.pausedConcepts, {});
	assert.deepEqual(data.reviewStates, {});
	assert.deepEqual(data.reviewDeferrals, {});
	assert.deepEqual(data.settings, DEFAULT_SETTINGS);
	assert.deepEqual(data.sourceAnalysisRecords, {});
}

{
	const data = normalizePluginData(undefined);

	assert.equal(data.schemaVersion, 1);
	assert.deepEqual(data.conceptSourceLinks, {});
	assert.deepEqual(data.knowledgeProposals, {});
	assert.deepEqual(data.pausedConcepts, {});
	assert.deepEqual(data.reviewStates, {});
	assert.deepEqual(data.reviewDeferrals, {});
	assert.deepEqual(data.settings, DEFAULT_SETTINGS);
	assert.deepEqual(data.sourceAnalysisRecords, {});
}

{
	const now = new Date(2026, 6, 7, 23, 30, 0);
	const tomorrow = startOfNextLocalDay(now);

	assert.equal(tomorrow.getFullYear(), 2026);
	assert.equal(tomorrow.getMonth(), 6);
	assert.equal(tomorrow.getDate(), 8);
	assert.equal(tomorrow.getHours(), 0);
}

{
	const data = normalizePluginData({
		reviewDeferrals: {
			invalid: { cardId: "invalid", deferredAt: "bad", resumeAt: "bad" },
			valid: {
				cardId: "valid",
				deferredAt: "2026-07-07T12:00:00.000Z",
				resumeAt: "2026-07-08T00:00:00.000Z",
			},
		},
	});

	assert.deepEqual(Object.keys(data.reviewDeferrals), ["valid"]);
}

async function runAsyncTests(): Promise<void> {
	{
		const existingState = createReviewState("encapsulation-basic", 2);
		const storage = new MemoryReviewStateStorage({
			pausedConcepts: {},
			reviewStates: { "encapsulation-basic": existingState },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		await store.pauseConcept("concept-encapsulation", new Date("2026-07-07T12:00:00.000Z"));

		assert.equal(store.getPausedConcepts()["concept-encapsulation"]?.conceptId, "concept-encapsulation");
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], existingState);
		assert.equal(scheduler.lastInput, undefined);

		await store.resumeConcept("concept-encapsulation");
		assert.deepEqual(store.getPausedConcepts(), {});
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], existingState);
	}

	{
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(new FailingReviewStateStorage(), scheduler);

		await store.load();
		await assert.rejects(
			store.deferReviewUntil(
				"encapsulation-basic",
				new Date("2026-07-08T00:00:00.000Z"),
				new Date("2026-07-07T12:00:00.000Z"),
			),
			/Persist failed/,
		);
		assert.deepEqual(store.getActiveReviewDeferrals(new Date("2026-07-07T13:00:00.000Z")), {});
		assert.equal(scheduler.lastInput, undefined);
	}

	{
		const existingState = createReviewState("encapsulation-basic", 2);
		const storage = new MemoryReviewStateStorage({
			reviewDeferrals: {},
			reviewStates: { "encapsulation-basic": existingState },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());
		const now = new Date("2026-07-07T12:00:00.000Z");
		const resumeAt = new Date("2026-07-08T00:00:00.000Z");

		await store.load();
		await storage.saveData({
			...normalizePluginData(await storage.loadData()),
			lateExternalField: { preserved: true },
		});
		const deferral = await store.deferReviewUntil("encapsulation-basic", resumeAt, now);

		assert.equal(deferral.resumeAt, resumeAt.toISOString());
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], existingState);
		assert.deepEqual(storage.savedData?.lateExternalField, { preserved: true });
		assert.equal(store.getActiveReviewDeferrals(new Date("2026-07-07T18:00:00.000Z"))["encapsulation-basic"]?.cardId, "encapsulation-basic");
		assert.deepEqual(store.getActiveReviewDeferrals(new Date("2026-07-08T00:00:00.000Z")), {});

		await store.recordReview("encapsulation-basic", "good");
		assert.equal(storage.savedData?.reviewDeferrals["encapsulation-basic"], undefined);
	}

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
			settings: DEFAULT_SETTINGS,
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

	{
		const storage = new MemoryReviewStateStorage({
			reviewStates: {
				"encapsulation-basic": createReviewState("encapsulation-basic", 2),
				"polymorphism-basic": createReviewState("polymorphism-basic", 1),
			},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();

		assert.equal(store.getReviewStateCount(), 2);

		await store.clearReviewStates();

		assert.equal(store.getReviewStateCount(), 0);
		assert.deepEqual(store.getAllStates(), {});
		assert.equal(storage.savedData?.schemaVersion, 1);
		assert.deepEqual(storage.savedData?.reviewStates, {});
		assert.deepEqual(storage.savedData?.reviewDeferrals, {});
	}

	{
		const storage = new MemoryReviewStateStorage({
			reviewStates: {
				"encapsulation-basic": createReviewState("encapsulation-basic", 2),
			},
			schemaVersion: 1,
			settings: {
				...DEFAULT_SETTINGS,
				fsrsRequestRetention: 0.85,
			},
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		await store.clearReviewStates();

		assert.deepEqual(storage.savedData?.reviewStates, {});
		assert.deepEqual(storage.savedData?.settings, {
			...DEFAULT_SETTINGS,
			fsrsRequestRetention: 0.85,
		});
	}

	{
		const storage = new MemoryReviewStateStorage({
			reviewStates: {},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		store.setSettings({
			...DEFAULT_SETTINGS,
			fsrsEnableFuzz: true,
			fsrsRequestRetention: 0.84,
		});
		await store.recordReview("encapsulation-basic", "good");

		assert.deepEqual(storage.savedData?.settings, {
			...DEFAULT_SETTINGS,
			fsrsEnableFuzz: true,
			fsrsRequestRetention: 0.84,
		});
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

class FailingReviewStateStorage implements ReviewStateStorage {
	async loadData(): Promise<unknown> {
		return undefined;
	}

	async saveData(): Promise<void> {
		throw new Error("Persist failed");
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
