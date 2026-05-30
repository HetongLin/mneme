import assert from "node:assert/strict";
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";
import { LoadedMnemeCard } from "../src/models/card";
import { MnemeConcept } from "../src/models/concept";
import { CardReviewState, FsrsCardState } from "../src/models/reviewState";
import {
	aggregateConceptMemoryById,
} from "../src/services/conceptMemoryAggregator";
import { rankReviewQueueConcepts } from "../src/services/conceptQueueRanker";
import { getDailyReviewEligibility } from "../src/services/dailyReviewEligibility";
import {
	FsrsReviewScheduler,
	FsrsSchedulerConfig,
	mapMnemeRatingToFsrsRating,
	mapMnemeSettingsToFsrsConfig,
} from "../src/services/fsrsReviewScheduler";
import { estimateFsrsRetrievability } from "../src/services/fsrsRetrievability";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";

const reviewedAt = "2026-01-10T12:00:00.000Z";
const now = new Date(reviewedAt);
const config: FsrsSchedulerConfig = {
	enableFuzz: false,
	maximumInterval: 36500,
	requestRetention: 0.9,
};

{
	const directScheduler = fsrs(mapMnemeSettingsToFsrsConfig(config));
	const directResult = directScheduler.next(
		createEmptyCard(new Date(reviewedAt)),
		new Date(reviewedAt),
		Rating.Good,
	);
	const adapterResult = new FsrsReviewScheduler(config).schedule({
		cardId: "contract-card",
		rating: "good",
		reviewedAt,
	});
	const adapterState = adapterResult.nextState;

	assert.equal(adapterState.dueAt, directResult.card.due.toISOString());
	assert.equal(adapterState.stability, directResult.card.stability);
	assert.equal(adapterState.difficulty, directResult.card.difficulty);
	assert.equal(adapterState.fsrsState, mapFsrsStateToStoredFsrsState(directResult.card.state));
	assert.equal(adapterState.reviewCount, directResult.card.reps);
	assert.equal(adapterState.lapseCount, directResult.card.lapses);
	assert.equal(adapterState.scheduledDays, directResult.card.scheduled_days);
}

{
	assert.equal(mapMnemeRatingToFsrsRating("again"), Rating.Again);
	assert.equal(mapMnemeRatingToFsrsRating("hard"), Rating.Hard);
	assert.equal(mapMnemeRatingToFsrsRating("good"), Rating.Good);
	assert.equal(mapMnemeRatingToFsrsRating("easy"), Rating.Easy);
}

{
	const directScheduler = fsrs(mapMnemeSettingsToFsrsConfig(config));
	const directDueAt = directScheduler.next(
		createEmptyCard(new Date(reviewedAt)),
		new Date(reviewedAt),
		Rating.Easy,
	).card.due.toISOString();
	const adapterDueAt = new FsrsReviewScheduler(config).schedule({
		cardId: "contract-card",
		rating: "easy",
		reviewedAt,
	}).nextState.dueAt;

	assert.equal(adapterDueAt, directDueAt);
}

{
	const state = createFsrsReviewState("future-card", "2026-01-11T12:00:00.000Z");
	const eligibility = getDailyReviewEligibility(createCard("future-card"), state, now);

	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "not-due");
}

{
	const state = createFsrsReviewState("due-card", now.toISOString());
	const eligibility = getDailyReviewEligibility(createCard("due-card"), state, now);

	assert.equal(eligibility.includedInDailyReview, true);
	assert.equal(eligibility.reason, "due");
}

{
	const eligibility = getDailyReviewEligibility(createCard("new-card"), undefined, now);

	assert.equal(eligibility.includedInDailyReview, true);
	assert.equal(eligibility.reason, "new");
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("future-card")])],
		{ "future-card": createFsrsReviewState("future-card", "2026-01-11T12:00:00.000Z") },
		now,
	);
	const summaries = aggregateConceptMemoryById(queue.concepts, {
		"future-card": createFsrsReviewState("future-card", "2026-01-11T12:00:00.000Z"),
	}, now);
	const ranked = rankReviewQueueConcepts(queue.concepts, summaries);

	assert.equal(queue.concepts[0]?.reviewableCount, 0);
	assert.equal(ranked.length, 0);
}

{
	const queue = buildReviewQueue(
		[createConcept([createCard("due-card"), createCard("future-card")])],
		{
			"due-card": createFsrsReviewState("due-card", now.toISOString()),
			"future-card": createFsrsReviewState("future-card", "2026-01-11T12:00:00.000Z"),
		},
		now,
	);
	const summaries = aggregateConceptMemoryById(queue.concepts, {
		"due-card": createFsrsReviewState("due-card", now.toISOString()),
		"future-card": createFsrsReviewState("future-card", "2026-01-11T12:00:00.000Z"),
	}, now);
	const ranked = rankReviewQueueConcepts(queue.concepts, summaries);

	assert.equal(queue.concepts[0]?.reviewableCount, 1);
	assert.equal(ranked.length, 1);
	assert.equal(queue.concepts[0]?.dueCards[0]?.cardId, "due-card");
	assert.equal(queue.concepts[0]?.notDueCards[0]?.cardId, "future-card");
}

{
	const reviewedState = new FsrsReviewScheduler(config).schedule({
		cardId: "reviewed-card",
		rating: "good",
		reviewedAt,
	}).nextState;
	const queue = buildReviewQueue(
		[createConcept([createCard("reviewed-card")])],
		{ "reviewed-card": reviewedState },
		now,
	);
	const summaries = aggregateConceptMemoryById(queue.concepts, { "reviewed-card": reviewedState }, now);
	const cardRisk = summaries[queue.concepts[0]?.conceptId ?? ""]?.cardRisks[0];

	assert.equal(typeof estimateFsrsRetrievability(reviewedState, now), "number");
	assert.equal(cardRisk?.retrievability !== undefined, true);
	assert.equal(cardRisk?.includedInDailyReview, false);
	assert.equal(queue.concepts[0]?.reviewableCount, 0);
	assert.equal(rankReviewQueueConcepts(queue.concepts, summaries).length, 0);
}

{
	const customConfig: FsrsSchedulerConfig = {
		enableFuzz: false,
		maximumInterval: 7,
		requestRetention: 0.85,
	};
	const reviewedState = new FsrsReviewScheduler(customConfig).schedule({
		cardId: "configured-card",
		rating: "good",
		reviewedAt,
	}).nextState;
	const eligibility = getDailyReviewEligibility(createCard("configured-card"), reviewedState, now);

	assert.equal(reviewedState.scheduler, "fsrs");
	assert.equal(eligibility.includedInDailyReview, false);
	assert.equal(eligibility.reason, "not-due");
}

function createConcept(cards: LoadedMnemeCard[]): MnemeConcept {
	return {
		cards,
		errors: [],
		folderPath: "Concepts/Contract",
		id: "Concepts/Contract",
		isReviewable: cards.some((card) => card.isValid),
		title: "Contract",
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
		errors: isValid ? [] : ["Invalid card"],
		front: "Front",
		hasExplicitCardId: true,
		id: cardId,
		isValid,
		path: "Concepts/Contract/Card.md",
		warnings: [],
	};
}

function createFsrsReviewState(cardId: string, dueAt: string): CardReviewState {
	return {
		cardId,
		createdAt: "2026-01-01T12:00:00.000Z",
		difficulty: 2.5,
		dueAt,
		elapsedDays: 0,
		fsrsState: "Review",
		lapseCount: 0,
		lastRating: "good",
		lastReviewedAt: "2026-01-01T12:00:00.000Z",
		learningSteps: 0,
		reviewCount: 1,
		scheduledDays: 1,
		scheduler: "fsrs",
		schedulerVersion: "ts-fsrs",
		stability: 3,
		updatedAt: "2026-01-01T12:00:00.000Z",
	};
}

function mapFsrsStateToStoredFsrsState(state: State): FsrsCardState {
	switch (state) {
		case State.New:
			return "New";
		case State.Learning:
			return "Learning";
		case State.Review:
			return "Review";
		case State.Relearning:
			return "Relearning";
	}
}
