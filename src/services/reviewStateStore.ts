import { CardReviewState, MnemePluginData, ReviewRating } from "../models/reviewState";

const CURRENT_SCHEMA_VERSION = 1;

export interface ReviewStateStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ReviewStateStore {
	private data: MnemePluginData = createDefaultPluginData();

	constructor(private readonly storage: ReviewStateStorage) {
	}

	async load(): Promise<void> {
		this.data = normalizePluginData(await this.storage.loadData());
	}

	getState(cardId: string): CardReviewState | undefined {
		return this.data.reviewStates[cardId];
	}

	getOrCreateState(cardId: string): CardReviewState {
		const existingState = this.getState(cardId);
		if (existingState) {
			return existingState;
		}

		const state = createInitialReviewState(cardId, new Date());
		this.data.reviewStates[cardId] = state;

		return state;
	}

	async recordReview(cardId: string, rating: ReviewRating): Promise<CardReviewState> {
		const now = new Date();
		const state = this.getState(cardId) ?? createInitialReviewState(cardId, now);
		const updatedState = applyReviewRating(state, rating, now);
		const nextData = {
			...this.data,
			reviewStates: {
				...this.data.reviewStates,
				[cardId]: updatedState,
			},
		};

		await this.storage.saveData(nextData);
		this.data = nextData;

		return updatedState;
	}

	getAllStates(): Record<string, CardReviewState> {
		return { ...this.data.reviewStates };
	}
}

export function createDefaultPluginData(): MnemePluginData {
	return {
		reviewStates: {},
		schemaVersion: CURRENT_SCHEMA_VERSION,
	};
}

export function normalizePluginData(data: unknown): MnemePluginData {
	if (!isObject(data)) {
		return createDefaultPluginData();
	}

	const reviewStates = isObject(data.reviewStates)
		? data.reviewStates
		: {};

	return {
		reviewStates: normalizeReviewStates(reviewStates),
		schemaVersion: CURRENT_SCHEMA_VERSION,
	};
}

export function createInitialReviewState(cardId: string, now: Date): CardReviewState {
	const nowIso = now.toISOString();

	return {
		cardId,
		createdAt: nowIso,
		lapseCount: 0,
		reviewCount: 0,
		updatedAt: nowIso,
	};
}

export function applyReviewRating(
	state: CardReviewState,
	rating: ReviewRating,
	now: Date,
): CardReviewState {
	const nowIso = now.toISOString();

	return {
		...state,
		dueAt: calculatePlaceholderDueAt(rating, now),
		lapseCount: state.lapseCount + (rating === "again" ? 1 : 0),
		lastRating: rating,
		lastReviewedAt: nowIso,
		reviewCount: state.reviewCount + 1,
		updatedAt: nowIso,
	};
}

export function calculatePlaceholderDueAt(rating: ReviewRating, now: Date): string {
	const intervalDaysByRating: Record<ReviewRating, number> = {
		again: 0,
		easy: 7,
		good: 3,
		hard: 1,
	};
	const dueAt = new Date(now);

	dueAt.setUTCDate(dueAt.getUTCDate() + intervalDaysByRating[rating]);

	return dueAt.toISOString();
}

function normalizeReviewStates(states: Record<string, unknown>): Record<string, CardReviewState> {
	const normalizedStates: Record<string, CardReviewState> = {};

	for (const [cardId, state] of Object.entries(states)) {
		if (!isCardReviewState(state)) {
			continue;
		}

		normalizedStates[cardId] = state;
	}

	return normalizedStates;
}

function isCardReviewState(value: unknown): value is CardReviewState {
	return isObject(value)
		&& typeof value.cardId === "string"
		&& typeof value.createdAt === "string"
		&& typeof value.updatedAt === "string"
		&& typeof value.reviewCount === "number"
		&& typeof value.lapseCount === "number";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
