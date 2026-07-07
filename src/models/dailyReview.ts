export type DailyReviewEligibilityReason =
	| "new"
	| "due"
	| "overdue"
	| "not-due"
	| "invalid"
	| "missing-due-at"
	| "exploratory-concept";

export interface DailyReviewEligibility {
	dueAt?: string;
	includedInDailyReview: boolean;
	isDue: boolean;
	isNew: boolean;
	isOverdue: boolean;
	reason: DailyReviewEligibilityReason;
}
