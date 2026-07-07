import type { RankedReviewQueueConcept } from "../models/conceptQueue";
import type { ReviewQueueConcept } from "../models/reviewQueue";
import type { CardReviewState } from "../models/reviewState";

export interface TodaysFocusLimits {
	cardsPerConcept: number;
	dailyCards: number;
	dailyConcepts: number;
}

export interface TodaysFocusSelection {
	concepts: RankedReviewQueueConcept[];
	hiddenCardCount: number;
	hiddenConceptCount: number;
	selectedCardCount: number;
}

export interface TodaysFocusUsage {
	reviewedCardIds: Set<string>;
	reviewedCardsByConcept: Record<string, number>;
	reviewedConceptIds: Set<string>;
}

export interface TodaysFocusExclusions {
	deferredCardIds?: Set<string>;
	pausedConceptIds?: Set<string>;
	suspendedCardIds?: Set<string>;
}

export function selectTodaysFocus(
	rankedConcepts: RankedReviewQueueConcept[],
	limits: TodaysFocusLimits,
	usage: TodaysFocusUsage = createEmptyUsage(),
	exclusions: TodaysFocusExclusions = {},
): TodaysFocusSelection {
	const deferredCardIds = exclusions.deferredCardIds ?? new Set<string>();
	const pausedConceptIds = exclusions.pausedConceptIds ?? new Set<string>();
	const suspendedCardIds = exclusions.suspendedCardIds ?? new Set<string>();
	const normalizedLimits = {
		cardsPerConcept: normalizeLimit(limits.cardsPerConcept),
		dailyCards: normalizeLimit(limits.dailyCards),
		dailyConcepts: normalizeLimit(limits.dailyConcepts),
	};
	const concepts: RankedReviewQueueConcept[] = [];
	let remainingCards = Math.max(0, normalizedLimits.dailyCards - usage.reviewedCardIds.size);
	if (usage.reviewedConceptIds.size > normalizedLimits.dailyConcepts) {
		remainingCards = 0;
	}
	let selectedNewConcepts = 0;

	for (const ranked of rankedConcepts) {
		if (remainingCards <= 0) {
			break;
		}

		const concept = ranked.concept;
		if (pausedConceptIds.has(concept.conceptId)) {
			continue;
		}
		const wasReviewedToday = usage.reviewedConceptIds.has(concept.conceptId);
		const remainingConceptSlots = normalizedLimits.dailyConcepts
			- usage.reviewedConceptIds.size
			- selectedNewConcepts;

		if (!wasReviewedToday && remainingConceptSlots <= 0) {
			continue;
		}

		const perConceptRemaining = Math.max(
			0,
			normalizedLimits.cardsPerConcept - (usage.reviewedCardsByConcept[concept.conceptId] ?? 0),
		);
		const selected = [...concept.dueCards, ...concept.newCards]
			.filter((card) => {
				return !usage.reviewedCardIds.has(card.cardId)
					&& !deferredCardIds.has(card.cardId)
					&& !suspendedCardIds.has(card.cardId);
			})
			.slice(0, Math.min(perConceptRemaining, remainingCards));

		if (selected.length === 0) {
			continue;
		}

		const dueCards = selected.filter((card) => card.dueStatus === "due");
		const newCards = selected.filter((card) => card.dueStatus === "new");
		concepts.push({
			...ranked,
			concept: {
				...concept,
				dueCards,
				newCards,
				reviewableCount: selected.length,
			},
		});
		if (!wasReviewedToday) {
			selectedNewConcepts += 1;
		}
		remainingCards -= selected.length;
	}

	const candidateConcepts = rankedConcepts.filter((ranked) => {
		if (pausedConceptIds.has(ranked.concept.conceptId)) {
			return false;
		}

		return [...ranked.concept.dueCards, ...ranked.concept.newCards]
			.some((card) => !usage.reviewedCardIds.has(card.cardId) && !suspendedCardIds.has(card.cardId));
	});
	const totalReviewableCards = candidateConcepts.reduce(
		(count, ranked) => count + [...ranked.concept.dueCards, ...ranked.concept.newCards]
			.filter((card) => !usage.reviewedCardIds.has(card.cardId) && !suspendedCardIds.has(card.cardId)).length,
		0,
	);
	const selectedCardCount = concepts.reduce(
		(count, ranked) => count + ranked.concept.reviewableCount,
		0,
	);

	return {
		concepts,
		hiddenCardCount: Math.max(0, totalReviewableCards - selectedCardCount),
		hiddenConceptCount: Math.max(0, candidateConcepts.length - concepts.length),
		selectedCardCount,
	};
}

export function buildTodaysFocusUsage(
	concepts: ReviewQueueConcept[],
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): TodaysFocusUsage {
	const usage = createEmptyUsage();

	for (const concept of concepts) {
		const cards = [
			...concept.dueCards,
			...concept.newCards,
			...concept.notDueCards,
		];

		for (const card of cards) {
			const lastReviewedAt = reviewStates[card.cardId]?.lastReviewedAt;

			if (!lastReviewedAt || !isSameLocalDay(lastReviewedAt, now)) {
				continue;
			}

			usage.reviewedCardIds.add(card.cardId);
			usage.reviewedConceptIds.add(concept.conceptId);
		}

		if (usage.reviewedConceptIds.has(concept.conceptId)) {
			usage.reviewedCardsByConcept[concept.conceptId] = cards.filter((card) => {
				const reviewedAt = reviewStates[card.cardId]?.lastReviewedAt;

				return reviewedAt ? isSameLocalDay(reviewedAt, now) : false;
			}).length;
		}
	}

	return usage;
}

function createEmptyUsage(): TodaysFocusUsage {
	return {
		reviewedCardIds: new Set<string>(),
		reviewedCardsByConcept: {},
		reviewedConceptIds: new Set<string>(),
	};
}

function isSameLocalDay(isoDate: string, now: Date): boolean {
	const value = new Date(isoDate);

	return !Number.isNaN(value.getTime())
		&& value.getFullYear() === now.getFullYear()
		&& value.getMonth() === now.getMonth()
		&& value.getDate() === now.getDate();
}

function normalizeLimit(value: number): number {
	return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
