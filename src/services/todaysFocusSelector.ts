import type { RankedReviewQueueConcept } from "../models/conceptQueue";

export interface TodaysFocusSelection {
	concepts: RankedReviewQueueConcept[];
	selectedCardCount: number;
}

export interface TodaysFocusExclusions {
	deferredCardIds?: Set<string>;
	pausedConceptIds?: Set<string>;
	retiredCardIds?: Set<string>;
	suspendedCardIds?: Set<string>;
}

export function selectTodaysFocus(
	rankedConcepts: RankedReviewQueueConcept[],
	fsrsEnabled: boolean,
	exclusions: TodaysFocusExclusions = {},
): TodaysFocusSelection {
	if (!fsrsEnabled) {
		return createEmptySelection();
	}

	const deferredCardIds = exclusions.deferredCardIds ?? new Set<string>();
	const pausedConceptIds = exclusions.pausedConceptIds ?? new Set<string>();
	const retiredCardIds = exclusions.retiredCardIds ?? new Set<string>();
	const suspendedCardIds = exclusions.suspendedCardIds ?? new Set<string>();
	const concepts: RankedReviewQueueConcept[] = [];

	for (const ranked of rankedConcepts) {
		const concept = ranked.concept;
		if (pausedConceptIds.has(concept.conceptId)) {
			continue;
		}

		const isIncluded = (cardId: string): boolean => {
			return !deferredCardIds.has(cardId)
				&& !retiredCardIds.has(cardId)
				&& !suspendedCardIds.has(cardId);
		};
		const dueCards = concept.dueCards.filter((card) => isIncluded(card.cardId));
		const newCards = concept.newCards.filter((card) => isIncluded(card.cardId));
		const reviewableCount = dueCards.length + newCards.length;

		if (reviewableCount === 0) {
			continue;
		}

		concepts.push({
			...ranked,
			concept: {
				...concept,
				dueCards,
				newCards,
				reviewableCount,
			},
		});
	}

	return {
		concepts,
		selectedCardCount: concepts.reduce(
			(count, ranked) => count + ranked.concept.reviewableCount,
			0,
		),
	};
}

function createEmptySelection(): TodaysFocusSelection {
	return {
		concepts: [],
		selectedCardCount: 0,
	};
}
