import { CardReviewState, ReviewRating } from "./reviewState";

export interface ReviewScheduleInput {
	cardId: string;
	previousState?: CardReviewState;
	rating: ReviewRating;
	requestRetention?: number;
	reviewedAt: string;
}

export interface ReviewScheduleResult {
	intervalDays: number;
	nextState: CardReviewState;
	scheduler: string;
}

export interface ReviewScheduler {
	schedule(input: ReviewScheduleInput): ReviewScheduleResult;
}
