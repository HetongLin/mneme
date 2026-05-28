import { fsrs, State, type Card } from "ts-fsrs";
import { CardReviewState, FsrsCardState } from "../models/reviewState";

const scheduler = fsrs({ enable_fuzz: false });

export function canEstimateFsrsRetrievability(state: CardReviewState | undefined): state is CardReviewState & {
	difficulty: number;
	dueAt: string;
	fsrsState: FsrsCardState;
	learningSteps: number;
	lastReviewedAt: string;
	scheduledDays: number;
	stability: number;
} {
	return state?.scheduler === "fsrs"
		&& isFiniteNumber(state.difficulty)
		&& isFiniteNumber(state.stability)
		&& isFiniteNumber(state.scheduledDays)
		&& isFiniteNumber(state.learningSteps)
		&& isStoredFsrsState(state.fsrsState)
		&& typeof state.dueAt === "string"
		&& !Number.isNaN(Date.parse(state.dueAt))
		&& typeof state.lastReviewedAt === "string"
		&& !Number.isNaN(Date.parse(state.lastReviewedAt));
}

export function estimateFsrsRetrievability(state: CardReviewState, now: Date): number | undefined {
	if (!canEstimateFsrsRetrievability(state)) {
		return undefined;
	}

	try {
		const retrievability = scheduler.get_retrievability(cardReviewStateToRetrievabilityCard(state), now, false);

		return clampUnitInterval(retrievability);
	} catch {
		return undefined;
	}
}

export function estimateFsrsRisk(
	state: CardReviewState | undefined,
	now: Date,
): { retrievability: number; risk: number } | undefined {
	if (!state) {
		return undefined;
	}

	const retrievability = estimateFsrsRetrievability(state, now);
	if (retrievability === undefined) {
		return undefined;
	}

	return {
		retrievability,
		risk: clampUnitInterval(1 - retrievability),
	};
}

export function clampUnitInterval(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(1, value));
}

function cardReviewStateToRetrievabilityCard(state: CardReviewState & {
	difficulty: number;
	dueAt: string;
	fsrsState: FsrsCardState;
	learningSteps: number;
	lastReviewedAt: string;
	scheduledDays: number;
	stability: number;
}): Card {
	return {
		difficulty: state.difficulty,
		due: new Date(state.dueAt),
		elapsed_days: state.elapsedDays ?? 0,
		lapses: state.lapseCount,
		last_review: new Date(state.lastReviewedAt),
		learning_steps: state.learningSteps,
		reps: state.reviewCount,
		scheduled_days: state.scheduledDays,
		stability: state.stability,
		state: mapStoredFsrsStateToFsrsState(state.fsrsState),
	};
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

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
