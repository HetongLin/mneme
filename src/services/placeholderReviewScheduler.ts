import { ReviewScheduler, ReviewScheduleInput, ReviewScheduleResult } from "../models/reviewScheduler";
import { CardReviewState, ReviewRating } from "../models/reviewState";

const SCHEDULER_NAME = "placeholder";

const INTERVAL_DAYS_BY_RATING: Record<ReviewRating, number> = {
	again: 0,
	easy: 7,
	good: 3,
	hard: 1,
};

const INITIAL_DIFFICULTY_BY_RATING: Record<ReviewRating, number> = {
	again: 0.9,
	easy: 0.3,
	good: 0.5,
	hard: 0.7,
};

export class PlaceholderReviewScheduler implements ReviewScheduler {
	schedule(input: ReviewScheduleInput): ReviewScheduleResult {
		const intervalDays = getPlaceholderIntervalDays(input.rating);
		const dueAt = calculatePlaceholderDueAt(input.reviewedAt, intervalDays);
		const previousState = input.previousState;
		const nextState: CardReviewState = {
			cardId: input.cardId,
			createdAt: previousState?.createdAt ?? input.reviewedAt,
			difficulty: previousState?.difficulty ?? INITIAL_DIFFICULTY_BY_RATING[input.rating],
			dueAt,
			lapseCount: (previousState?.lapseCount ?? 0) + (input.rating === "again" ? 1 : 0),
			lastRating: input.rating,
			lastReviewedAt: input.reviewedAt,
			reviewCount: (previousState?.reviewCount ?? 0) + 1,
			scheduler: SCHEDULER_NAME,
			stability: previousState?.stability ?? intervalDays,
			updatedAt: input.reviewedAt,
		};

		return {
			intervalDays,
			nextState,
			scheduler: SCHEDULER_NAME,
		};
	}
}

export function getPlaceholderIntervalDays(rating: ReviewRating): number {
	return INTERVAL_DAYS_BY_RATING[rating];
}

export function calculatePlaceholderDueAt(reviewedAt: string, intervalDays: number): string {
	const dueAt = new Date(reviewedAt);

	dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays);

	return dueAt.toISOString();
}
