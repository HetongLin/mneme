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
		: concepts.filter((concept) => (memorySummaries[concept.conceptId]?.reviewCardCount ?? concept.reviewableCount) > 0);

	return [...rankableConcepts]
		.sort((left, right) => compareReviewQueueConcepts(left, right, memorySummaries))
		.map((concept, index) => {
			const memorySummary = memorySummaries[concept.conceptId];

			return {
				concept,
				priorityBand: memorySummary?.priorityBand ?? "low",
				priorityScore: memorySummary?.reviewPriorityScore ?? memorySummary?.priorityScore ?? 0,
				rank: index + 1,
				reviewPriorityScore: memorySummary?.reviewPriorityScore ?? memorySummary?.priorityScore ?? 0,
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
	const priorityDifference = (rightSummary?.reviewPriorityScore ?? 0) - (leftSummary?.reviewPriorityScore ?? 0);

	if (priorityDifference !== 0) {
		return priorityDifference;
	}

	const overdueDifference = (rightSummary?.overdueCardCount ?? 0) - (leftSummary?.overdueCardCount ?? 0);
	if (overdueDifference !== 0) {
		return overdueDifference;
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
