import { ConceptMemorySummary } from "../models/conceptMemory";
import { RankedReviewQueueConcept } from "../models/conceptQueue";
import { ReviewQueueConcept } from "../models/reviewQueue";

export interface ConceptQueueRankingOptions {
	includeNonReviewable?: boolean;
}

export function rankReviewQueueConcepts(
	concepts: ReviewQueueConcept[],
	memorySummaries: Record<string, ConceptMemorySummary>,
	options: ConceptQueueRankingOptions = {},
): RankedReviewQueueConcept[] {
	const rankableConcepts = options.includeNonReviewable
		? concepts
		: concepts.filter((concept) => concept.reviewableCount > 0);

	return [...rankableConcepts]
		.sort((left, right) => compareReviewQueueConcepts(left, right, memorySummaries))
		.map((concept, index) => {
			const memorySummary = memorySummaries[concept.conceptId];

			return {
				concept,
				priorityBand: memorySummary?.priorityBand ?? "low",
				priorityScore: memorySummary?.priorityScore ?? 0,
				rank: index + 1,
			};
		});
}

export function indexRankedConceptsById(
	rankedConcepts: RankedReviewQueueConcept[],
): Record<string, RankedReviewQueueConcept> {
	const rankedConceptsById: Record<string, RankedReviewQueueConcept> = {};

	for (const rankedConcept of rankedConcepts) {
		rankedConceptsById[rankedConcept.concept.conceptId] = rankedConcept;
	}

	return rankedConceptsById;
}

function compareReviewQueueConcepts(
	left: ReviewQueueConcept,
	right: ReviewQueueConcept,
	memorySummaries: Record<string, ConceptMemorySummary>,
): number {
	const leftSummary = memorySummaries[left.conceptId];
	const rightSummary = memorySummaries[right.conceptId];
	const priorityDifference = (rightSummary?.priorityScore ?? 0) - (leftSummary?.priorityScore ?? 0);

	if (priorityDifference !== 0) {
		return priorityDifference;
	}

	const dueDifference = right.dueCards.length - left.dueCards.length;
	if (dueDifference !== 0) {
		return dueDifference;
	}

	const newDifference = right.newCards.length - left.newCards.length;
	if (newDifference !== 0) {
		return newDifference;
	}

	return left.title.localeCompare(right.title);
}
