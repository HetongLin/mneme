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
	stability?: number;
	updatedAt: string;
}

export interface MnemePluginData {
	reviewStates: Record<string, CardReviewState>;
	schemaVersion: number;
}
