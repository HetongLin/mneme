export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface CardReviewState {
	cardId: string;
	createdAt: string;
	difficulty?: number;
	dueAt?: string;
	lapseCount: number;
	lastRating?: ReviewRating;
	lastReviewedAt?: string;
	reviewCount: number;
	scheduler?: string;
	stability?: number;
	updatedAt: string;
}

export interface MnemePluginData {
	[key: string]: unknown;
	reviewStates: Record<string, CardReviewState>;
	schemaVersion: number;
}
