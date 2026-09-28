import type { LoadedMnemeCard } from "../models/card";
import type { MnemeConcept } from "../models/concept";

/** Require the learner's displayed Card and owner to still match a fresh scan. */
export function assertReviewRatingSnapshot(
	shownConcept: MnemeConcept,
	shownCard: LoadedMnemeCard,
	currentConcepts: MnemeConcept[],
): void {
	const owners = currentConcepts.filter((concept) => concept.id === shownConcept.id);
	const matches = currentConcepts.flatMap((concept) => concept.cards
		.filter((card) => card.cardId === shownCard.cardId)
		.map((card) => ({ concept, card })));
	const current = matches[0];
	if (owners.length !== 1 || matches.length !== 1 || !current || current.concept !== owners[0]) {
		throw new Error("Card ownership changed or is no longer unambiguous. Refresh and review the Card again.");
	}
	const { concept, card } = current;
	if (concept.errors.length > 0 || !card.isValid || !card.hasExplicitCardId) {
		throw new Error("The Card is no longer valid for review. Refresh and resolve the Card diagnostics before rating.");
	}
	if (concept.conceptPath !== shownConcept.conceptPath
		|| concept.learningMode !== shownConcept.learningMode
		|| concept.retentionTarget !== shownConcept.retentionTarget) {
		throw new Error("Concept ownership or review settings changed. Refresh and review the Card again.");
	}
	if (card.path !== shownCard.path
		|| card.front !== shownCard.front
		|| card.back !== shownCard.back
		|| card.rubric !== shownCard.rubric
		|| card.cardType !== shownCard.cardType) {
		throw new Error("Card content or location changed. Refresh and review the Card again.");
	}
}
