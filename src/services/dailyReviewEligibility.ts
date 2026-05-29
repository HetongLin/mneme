import { LoadedMnemeCard } from "../models/card";
import { DailyReviewEligibility } from "../models/dailyReview";
import { CardReviewState } from "../models/reviewState";

export function isNewCardReviewState(state: CardReviewState | undefined): boolean {
	return state === undefined;
}

export function isCardDueForDailyReview(state: CardReviewState | undefined, now: Date): boolean {
	if (!state?.dueAt) {
		return false;
	}

	const dueAtMs = Date.parse(state.dueAt);

	return !Number.isNaN(dueAtMs) && dueAtMs <= now.getTime();
}

export function getDailyReviewEligibility(
	card: LoadedMnemeCard,
	state: CardReviewState | undefined,
	now: Date,
): DailyReviewEligibility {
	if (!card.isValid) {
		return createEligibility({
			includedInDailyReview: false,
			reason: "invalid",
		});
	}

	if (!state) {
		return createEligibility({
			includedInDailyReview: true,
			isNew: true,
			reason: "new",
		});
	}

	if (!state.dueAt) {
		return createEligibility({
			includedInDailyReview: false,
			reason: "missing-due-at",
		});
	}

	const dueAtMs = Date.parse(state.dueAt);

	if (Number.isNaN(dueAtMs)) {
		return createEligibility({
			dueAt: state.dueAt,
			includedInDailyReview: false,
			reason: "missing-due-at",
		});
	}

	if (dueAtMs <= now.getTime()) {
		const isOverdue = dueAtMs < now.getTime();

		return createEligibility({
			dueAt: state.dueAt,
			includedInDailyReview: true,
			isDue: true,
			isOverdue,
			reason: isOverdue ? "overdue" : "due",
		});
	}

	return createEligibility({
		dueAt: state.dueAt,
		includedInDailyReview: false,
		reason: "not-due",
	});
}

function createEligibility(overrides: Partial<DailyReviewEligibility>): DailyReviewEligibility {
	return {
		dueAt: overrides.dueAt,
		includedInDailyReview: overrides.includedInDailyReview ?? false,
		isDue: overrides.isDue ?? false,
		isNew: overrides.isNew ?? false,
		isOverdue: overrides.isOverdue ?? false,
		reason: overrides.reason ?? "not-due",
	};
}
