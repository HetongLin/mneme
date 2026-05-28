import { ReviewScheduler } from "../models/reviewScheduler";
import { CardReviewState, MnemePluginData, ReviewRating } from "../models/reviewState";

const CURRENT_SCHEMA_VERSION = 1;

export interface ReviewStateStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ReviewStateStore {
	private data: MnemePluginData = createDefaultPluginData();
	private isLoaded = false;

	constructor(
		private readonly storage: ReviewStateStorage,
		private readonly scheduler: ReviewScheduler,
	) {
	}

	async load(): Promise<void> {
		this.data = normalizePluginData(await this.storage.loadData());
		this.isLoaded = true;
	}

	getState(cardId: string): CardReviewState | undefined {
		return this.data.reviewStates[cardId];
	}

	async recordReview(cardId: string, rating: ReviewRating): Promise<CardReviewState> {
		await this.ensureLoaded();
		const scheduleResult = this.scheduler.schedule({
			cardId,
			previousState: this.getState(cardId),
			rating,
			reviewedAt: new Date().toISOString(),
		});
		const nextData = {
			...this.data,
			reviewStates: {
				...this.data.reviewStates,
				[cardId]: scheduleResult.nextState,
			},
		};

		await this.storage.saveData(nextData);
		this.data = nextData;

		return scheduleResult.nextState;
	}

	getAllStates(): Record<string, CardReviewState> {
		return { ...this.data.reviewStates };
	}

	getReviewStateCount(): number {
		return Object.keys(this.data.reviewStates).length;
	}

	async clearReviewStates(): Promise<void> {
		await this.ensureLoaded();
		const nextData = {
			...this.data,
			reviewStates: {},
			schemaVersion: this.data.schemaVersion,
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.isLoaded) {
			return;
		}

		await this.load();
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
		...data,
		reviewStates: normalizeReviewStates(reviewStates),
		schemaVersion: CURRENT_SCHEMA_VERSION,
	};
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
