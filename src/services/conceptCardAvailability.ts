import type { ConceptSummary } from "../models/conceptLibrary";

export interface LoadedConceptCardAvailability {
	cards: Array<{ isValid: boolean; path?: string }>;
	errors?: string[];
	id: string;
}

export function attachValidCardCounts(
	concepts: ConceptSummary[],
	loadedConcepts: LoadedConceptCardAvailability[],
): ConceptSummary[] {
	const loadedById = new Map(loadedConcepts.map((concept) => [concept.id, concept]));
	const errorsByCardPath = new Map<string, string>();
	for (const loaded of loadedConcepts) {
		const error = loaded.errors?.join(" ");
		if (!error) continue;
		for (const card of loaded.cards) {
			if (card.path) errorsByCardPath.set(card.path, error);
		}
	}

	return concepts.map((concept) => ({
		...concept,
		cardCount: loadedById.get(concept.conceptId)?.cards.filter((card) => card.isValid).length ?? 0,
		cardReviewError: loadedById.get(concept.conceptId)?.errors?.join(" ")
			|| (concept.cardsPath ? errorsByCardPath.get(concept.cardsPath) : undefined),
	}));
}

export function hasValidReviewCards(concept: Pick<ConceptSummary, "cardCount">): boolean {
	return (concept.cardCount ?? 0) > 0;
}
