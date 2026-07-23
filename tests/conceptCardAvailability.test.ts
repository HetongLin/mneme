import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	attachValidCardCounts,
	hasValidReviewCards,
} from "../src/services/conceptCardAvailability";

const alpha: ConceptSummary = {
	cardsPath: "Mneme/Cards/Alpha/Cards.md",
	conceptId: "concept-alpha",
	path: "Mneme/Concepts/Alpha.md",
	title: "Alpha",
};
const beta: ConceptSummary = {
	cardsPath: "Mneme/Cards/Beta/Cards.md",
	conceptId: "concept-beta",
	path: "Mneme/Concepts/Beta.md",
	title: "Beta",
};
const gamma: ConceptSummary = {
	cardsPath: "Mneme/Cards/Gamma/Cards.md",
	conceptId: "concept-gamma",
	path: "Mneme/Concepts/Gamma.md",
	title: "Gamma",
};

{
	const concepts = attachValidCardCounts([alpha, beta, gamma], [
		{
			cards: [{ isValid: true }, { isValid: false }],
			id: alpha.conceptId,
		},
		{
			cards: [{ isValid: false }],
			id: gamma.conceptId,
		},
	]);

	assert.equal(concepts[0]?.cardCount, 1);
	assert.equal(concepts[1]?.cardCount, 0);
	assert.equal(concepts[2]?.cardCount, 0);
	assert.equal(hasValidReviewCards(concepts[0] as ConceptSummary), true);
	assert.equal(hasValidReviewCards(concepts[1] as ConceptSummary), false);
	assert.equal(hasValidReviewCards(concepts[2] as ConceptSummary), false);
}

{
	assert.equal(hasValidReviewCards({ cardCount: 0 }), false);
	assert.equal(hasValidReviewCards({ cardCount: undefined }), false);
}

console.log("Concept Card availability tests passed.");
