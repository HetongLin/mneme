import { createEmptyCard, FSRSVersion, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";
import { ReviewScheduler, ReviewScheduleInput, ReviewScheduleResult } from "../models/reviewScheduler";
import { CardReviewState, FsrsCardState, ReviewRating } from "../models/reviewState";

const SCHEDULER_NAME = "fsrs";
const scheduler = fsrs({ enable_fuzz: false });

export class FsrsReviewScheduler implements ReviewScheduler {
	schedule(input: ReviewScheduleInput): ReviewScheduleResult {
		const fsrsCard = cardReviewStateToFsrsCard(input.cardId, input.previousState, input.reviewedAt);
		const result = scheduler.next(fsrsCard, new Date(input.reviewedAt), mapMnemeRatingToFsrsRating(input.rating));
		const nextState = fsrsCardToCardReviewState(
			input.cardId,
			result.card,
			input.rating,
			input.previousState,
			input.reviewedAt,
		);

		return {
			intervalDays: result.card.scheduled_days,
			nextState,
			scheduler: SCHEDULER_NAME,
		};
	}
}

export function mapMnemeRatingToFsrsRating(rating: ReviewRating): Grade {
	switch (rating) {
		case "again":
			return Rating.Again;
		case "hard":
			return Rating.Hard;
		case "good":
			return Rating.Good;
		case "easy":
			return Rating.Easy;
	}
}

export function cardReviewStateToFsrsCard(
	cardId: string,
	state: CardReviewState | undefined,
	reviewedAt: string,
): Card {
	if (!isContinuableFsrsState(state)) {
		return createEmptyCard(new Date(reviewedAt));
	}

	return {
		difficulty: state.difficulty,
		due: new Date(state.dueAt),
		elapsed_days: state.elapsedDays ?? 0,
		lapses: state.lapseCount,
		last_review: state.lastReviewedAt ? new Date(state.lastReviewedAt) : undefined,
		learning_steps: state.learningSteps,
		reps: state.reviewCount,
		scheduled_days: state.scheduledDays,
		stability: state.stability,
		state: mapStoredFsrsStateToFsrsState(state.fsrsState),
	};
}

export function fsrsCardToCardReviewState(
	cardId: string,
	fsrsCard: Card,
	rating: ReviewRating,
	previousState: CardReviewState | undefined,
	reviewedAt: string,
): CardReviewState {
	return {
		cardId,
		createdAt: previousState?.createdAt ?? reviewedAt,
		difficulty: fsrsCard.difficulty,
		dueAt: fsrsCard.due.toISOString(),
		elapsedDays: fsrsCard.elapsed_days,
		fsrsState: mapFsrsStateToStoredFsrsState(fsrsCard.state),
		lapseCount: fsrsCard.lapses,
		lastRating: rating,
		lastReviewedAt: fsrsCard.last_review?.toISOString() ?? reviewedAt,
		learningSteps: fsrsCard.learning_steps,
		reviewCount: fsrsCard.reps,
		scheduledDays: fsrsCard.scheduled_days,
		scheduler: SCHEDULER_NAME,
		schedulerVersion: FSRSVersion,
		stability: fsrsCard.stability,
		updatedAt: reviewedAt,
	};
}

function isContinuableFsrsState(state: CardReviewState | undefined): state is CardReviewState & {
	difficulty: number;
	dueAt: string;
	fsrsState: FsrsCardState;
	learningSteps: number;
	scheduledDays: number;
	stability: number;
} {
	return state?.scheduler === SCHEDULER_NAME
		&& isFiniteNumber(state.difficulty)
		&& isFiniteNumber(state.stability)
		&& isFiniteNumber(state.scheduledDays)
		&& isFiniteNumber(state.learningSteps)
		&& isStoredFsrsState(state.fsrsState)
		&& typeof state.dueAt === "string"
		&& !Number.isNaN(Date.parse(state.dueAt))
		&& (!state.lastReviewedAt || !Number.isNaN(Date.parse(state.lastReviewedAt)));
}

function isStoredFsrsState(state: unknown): state is FsrsCardState {
	return state === "New"
		|| state === "Learning"
		|| state === "Review"
		|| state === "Relearning";
}

function mapStoredFsrsStateToFsrsState(state: FsrsCardState): State {
	switch (state) {
		case "New":
			return State.New;
		case "Learning":
			return State.Learning;
		case "Review":
			return State.Review;
		case "Relearning":
			return State.Relearning;
	}
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

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
