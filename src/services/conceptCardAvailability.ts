import type { ConceptSummary } from "../models/conceptLibrary";

export interface LoadedConceptCardAvailability {
	cards: Array<{ isValid: boolean }>;
	id: string;
}

export function attachValidCardCounts(
	concepts: ConceptSummary[],
	loadedConcepts: LoadedConceptCardAvailability[],
): ConceptSummary[] {
	const validCountByConceptId = new Map(loadedConcepts.map((concept) => [
		concept.id,
		concept.cards.filter((card) => card.isValid).length,
	]));

	return concepts.map((concept) => ({
		...concept,
		cardCount: validCountByConceptId.get(concept.conceptId) ?? 0,
	}));
}

export function hasValidReviewCards(concept: Pick<ConceptSummary, "cardCount">): boolean {
	return (concept.cardCount ?? 0) > 0;
}
