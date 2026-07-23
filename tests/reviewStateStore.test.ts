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
	assert.deepEqual(data.cardTombstones, {});
	assert.deepEqual(data.conceptDuplicateDismissals, {});
	assert.deepEqual(data.conceptMergeRecords, {});
	assert.deepEqual(data.conceptSourceLinks, {});
	assert.deepEqual(data.knowledgeProposals, {});
	assert.deepEqual(data.pausedConcepts, {});
	assert.deepEqual(data.retiredCards, {});
	assert.deepEqual(data.reviewStates, {});
	assert.deepEqual(data.reviewDeferrals, {});
	assert.deepEqual(data.reviewEvents, {});
	assert.deepEqual(data.settings, DEFAULT_SETTINGS);
	assert.deepEqual(data.sourceAnalysisRecords, {});
	assert.deepEqual(data.suspendedCards, {});
}

{
	const data = normalizePluginData(undefined);

	assert.equal(data.schemaVersion, 1);
	assert.deepEqual(data.cardTombstones, {});
	assert.deepEqual(data.conceptDuplicateDismissals, {});
	assert.deepEqual(data.conceptMergeRecords, {});
	assert.deepEqual(data.conceptSourceLinks, {});
	assert.deepEqual(data.knowledgeProposals, {});
	assert.deepEqual(data.pausedConcepts, {});
	assert.deepEqual(data.retiredCards, {});
	assert.deepEqual(data.reviewStates, {});
	assert.deepEqual(data.reviewDeferrals, {});
	assert.deepEqual(data.reviewEvents, {});
	assert.deepEqual(data.settings, DEFAULT_SETTINGS);
	assert.deepEqual(data.sourceAnalysisRecords, {});
	assert.deepEqual(data.suspendedCards, {});
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
		const cardState = createReviewState("concept-a-definition", 3);
		const storage = new MemoryReviewStateStorage({
			...createDefaultPluginData(),
			pausedConcepts: {
				"concept-a": {
					conceptId: "concept-a",
					pausedAt: "2026-07-08T10:00:00.000Z",
				},
			},
			reviewStates: {
				"concept-a-definition": cardState,
			},
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		const tombstones = await store.deleteConcept(
			"concept-a",
			["concept-a-definition"],
			new Date("2026-07-09T10:00:00.000Z"),
		);

		assert.equal(tombstones[0]?.reviewCount, 3);
		assert.equal(storage.savedData?.reviewStates["concept-a-definition"], undefined);
		assert.equal(storage.savedData?.pausedConcepts["concept-a"], undefined);
		assert.equal(storage.savedData?.cardTombstones["concept-a-definition"]?.deletedAt, "2026-07-09T10:00:00.000Z");
	}

	{
		const storage = new MemoryReviewStateStorage();
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		const dismissal = await store.dismissConceptDuplicate(
			"concept-b",
			"concept-a",
			new Date("2026-07-08T10:00:00.000Z"),
		);

		assert.equal(dismissal.pairKey, '["concept-a","concept-b"]');
		assert.deepEqual(dismissal.conceptIds, ["concept-a", "concept-b"]);
		assert.equal(store.getConceptDuplicateDismissals()[dismissal.pairKey]?.dismissedAt, "2026-07-08T10:00:00.000Z");

		await store.reconsiderConceptDuplicate(dismissal.pairKey);
		assert.deepEqual(store.getConceptDuplicateDismissals(), {});
	}

	{
		const existingState = createReviewState("encapsulation-basic", 2);
		const storage = new MemoryReviewStateStorage({
			reviewDeferrals: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					deferredAt: "2026-07-07T10:00:00.000Z",
					resumeAt: "2026-07-08T00:00:00.000Z",
				},
			},
			reviewStates: { "encapsulation-basic": existingState },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
			suspendedCards: {},
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		await store.suspendCard("encapsulation-basic", new Date("2026-07-07T12:00:00.000Z"));

		assert.equal(store.getSuspendedCards()["encapsulation-basic"]?.cardId, "encapsulation-basic");
		assert.equal(storage.savedData?.reviewDeferrals["encapsulation-basic"], undefined);
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], existingState);
		assert.equal(scheduler.lastInput, undefined);

		await store.resumeCard("encapsulation-basic");
		assert.deepEqual(store.getSuspendedCards(), {});
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], existingState);
	}

	{
		const existingState = createReviewState("retire-me", 3);
		const storage = new MemoryReviewStateStorage({
			reviewDeferrals: {
				"retire-me": {
					cardId: "retire-me",
					deferredAt: "2026-07-07T10:00:00.000Z",
					resumeAt: "2026-07-08T00:00:00.000Z",
				},
			},
			reviewStates: { "retire-me": existingState },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
			suspendedCards: {
				"retire-me": {
					cardId: "retire-me",
					suspendedAt: "2026-07-07T11:00:00.000Z",
				},
			},
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		await store.retireCard("retire-me", new Date("2026-07-07T12:00:00.000Z"));

		assert.equal(store.getRetiredCards()["retire-me"]?.retiredAt, "2026-07-07T12:00:00.000Z");
		assert.equal(storage.savedData?.reviewDeferrals["retire-me"], undefined);
		assert.equal(storage.savedData?.suspendedCards["retire-me"], undefined);
		assert.deepEqual(storage.savedData?.reviewStates["retire-me"], existingState);

		await store.restoreRetiredCard("retire-me");
		assert.deepEqual(store.getRetiredCards(), {});
		assert.deepEqual(storage.savedData?.reviewStates["retire-me"], existingState);
	}

	{
		const storage = new MemoryReviewStateStorage({
			pausedConcepts: {
				"concept-old": {
					conceptId: "concept-old",
					pausedAt: "2026-07-07T12:00:00.000Z",
				},
			},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		await store.rekeyConcept("concept-old", "concept-new");

		assert.equal(store.getPausedConcepts()["concept-old"], undefined);
		assert.equal(store.getPausedConcepts()["concept-new"]?.conceptId, "concept-new");
	}

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
		const existingState = createReviewState("preserve-card-state", 4);
		const storage = new MemoryReviewStateStorage({
			pausedConcepts: {
				"concept-a": {
					conceptId: "concept-a",
					pausedAt: "2026-07-07T12:00:00.000Z",
				},
				"concept-b": {
					conceptId: "concept-b",
					pausedAt: "2026-07-07T13:00:00.000Z",
				},
			},
			reviewStates: { "preserve-card-state": existingState },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		assert.equal(await store.clearConceptPauses(), 2);
		assert.deepEqual(store.getPausedConcepts(), {});
		assert.deepEqual(storage.savedData?.reviewStates["preserve-card-state"], existingState);
		assert.equal(scheduler.lastInput, undefined);
		assert.equal(await store.clearConceptPauses(), 0);
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
		const updatedState = await store.recordReview("encapsulation-basic", "good", {
			requestRetention: 0.94,
		});

		assert.equal(scheduler.lastInput?.cardId, "encapsulation-basic");
		assert.equal(scheduler.lastInput?.rating, "good");
		assert.equal(scheduler.lastInput?.requestRetention, 0.94);
		assert.equal(scheduler.lastInput?.previousState, undefined);
		assert.equal(updatedState.cardId, "encapsulation-basic");
		assert.equal(updatedState.reviewCount, 1);
		assert.deepEqual(storage.savedData?.reviewStates["encapsulation-basic"], updatedState);
		assert.deepEqual(store.getState("encapsulation-basic"), updatedState);
		assert.equal(store.getReviewEvents().length, 1);
		assert.equal(store.getReviewEvents()[0]?.cardId, "encapsulation-basic");
		assert.equal(store.getReviewEvents()[0]?.rating, "good");
	}

	{
		const existingState = createReviewState("paused-scheduling-card", 2);
		const storage = new MemoryReviewStateStorage({
			reviewEvents: {},
			reviewStates: { "paused-scheduling-card": existingState },
			schemaVersion: 1,
			settings: { ...DEFAULT_SETTINGS, fsrsEnabled: false },
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		const updatedState = await store.recordReview("paused-scheduling-card", "good");

		assert.equal(scheduler.lastInput?.cardId, "paused-scheduling-card");
		assert.equal(scheduler.lastInput?.rating, "good");
		assert.deepEqual(scheduler.lastInput?.previousState, existingState);
		assert.deepEqual(store.getState("paused-scheduling-card"), updatedState);
		assert.equal(store.getReviewEvents().length, 1);
		assert.equal(store.getReviewEvents()[0]?.cardId, "paused-scheduling-card");
	}

	{
		const storage = new MemoryReviewStateStorage();
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		await store.recordReview("delete-me", "again");
		await store.retireCard("delete-me", new Date("2026-07-07T11:00:00.000Z"));
		const tombstone = await store.deleteCard("delete-me", new Date("2026-07-07T12:00:00.000Z"));

		assert.equal(tombstone.reviewCount, 1);
		assert.equal(tombstone.lapseCount, 1);
		assert.equal(store.getState("delete-me"), undefined);
		assert.equal(store.getRetiredCards()["delete-me"], undefined);
		assert.equal(store.getReviewEvents().filter((event) => event.cardId === "delete-me").length, 1);
		assert.equal(store.getCardTombstones()["delete-me"]?.deletedAt, "2026-07-07T12:00:00.000Z");
		await assert.rejects(store.recordReview("delete-me", "good"), /Deleted Card IDs/);

		await store.eraseDeletedCardHistory("delete-me");
		assert.equal(store.getCardTombstones()["delete-me"], undefined);
		assert.equal(store.getReviewEvents().filter((event) => event.cardId === "delete-me").length, 0);
	}

	{
		const oldCardId = "Mneme/Cards/Encapsulation/Card.md#0";
		const newCardId = "card-encapsulation-stable";
		const storage = new MemoryReviewStateStorage({
			retiredCards: {
				[oldCardId]: {
					cardId: oldCardId,
					retiredAt: "2026-07-07T09:00:00.000Z",
				},
			},
			reviewEvents: {
				event: {
					cardId: oldCardId,
					eventId: "event",
					rating: "good",
					reviewedAt: "2026-07-07T08:00:00.000Z",
				},
			},
			reviewDeferrals: {
				[oldCardId]: {
					cardId: oldCardId,
					deferredAt: "2026-07-07T10:00:00.000Z",
					resumeAt: "2026-07-08T00:00:00.000Z",
				},
			},
			reviewStates: { [oldCardId]: createReviewState(oldCardId, 2) },
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
			suspendedCards: {
				[oldCardId]: {
					cardId: oldCardId,
					suspendedAt: "2026-07-07T12:00:00.000Z",
				},
			},
		});
		const scheduler = new FakeReviewScheduler();
		const store = new ReviewStateStore(storage, scheduler);

		await store.load();
		await store.rekeyCard(oldCardId, newCardId);

		assert.equal(storage.savedData?.reviewStates[oldCardId], undefined);
		assert.equal(storage.savedData?.reviewStates[newCardId]?.cardId, newCardId);
		assert.equal(storage.savedData?.reviewStates[newCardId]?.reviewCount, 2);
		assert.equal(storage.savedData?.reviewDeferrals[newCardId]?.cardId, newCardId);
		assert.equal(storage.savedData?.reviewEvents.event?.cardId, newCardId);
		assert.equal(storage.savedData?.retiredCards[newCardId]?.cardId, newCardId);
		assert.equal(storage.savedData?.retiredCards[oldCardId], undefined);
		assert.equal(storage.savedData?.suspendedCards[newCardId]?.cardId, newCardId);
		assert.equal(scheduler.lastInput, undefined);
	}

	{
		const storage = new MemoryReviewStateStorage({
			cardTombstones: {
				deleted: {
					cardId: "deleted",
					deletedAt: "2026-07-07T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 0,
				},
			},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		await assert.rejects(store.rekeyCard("old", "deleted"), /already has review state/);
		assert.equal(storage.savedData, undefined);
	}

	{
		const storage = new MemoryReviewStateStorage({
			reviewStates: {
				new: createReviewState("new", 1),
				old: createReviewState("old", 2),
			},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
		});
		const store = new ReviewStateStore(storage, new FakeReviewScheduler());

		await store.load();
		await assert.rejects(store.rekeyCard("old", "new"), /already has review state/);
		assert.equal(storage.savedData, undefined);
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
			cardTombstones: {
				deleted: {
					cardId: "deleted",
					deletedAt: "2026-07-07T12:00:00.000Z",
					lapseCount: 2,
					reviewCount: 5,
				},
			},
			reviewEvents: {
				event: {
					cardId: "deleted",
					eventId: "event",
					rating: "again",
					reviewedAt: "2026-07-07T10:00:00.000Z",
				},
			},
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
		assert.deepEqual(storage.savedData?.reviewEvents, {});
		assert.equal(storage.savedData?.cardTombstones.deleted?.reviewCount, 0);
		assert.equal(storage.savedData?.cardTombstones.deleted?.lapseCount, 0);
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
