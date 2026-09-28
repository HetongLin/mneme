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

{
	const blocked = attachValidCardCounts([alpha], [{
		id: alpha.conceptId, cards: [{ isValid: false }], errors: ["Conflicting Concept paths for owner concept-alpha"],
	}])[0]!;
	assert.equal(blocked.cardCount, 0);
	assert.match(blocked.cardReviewError!, /Conflicting Concept paths/);
	const repaired = attachValidCardCounts([blocked], [{ id: alpha.conceptId, cards: [{ isValid: true }] }])[0]!;
	assert.equal(repaired.cardCount, 1);
	assert.equal(repaired.cardReviewError, undefined, "Refreshing a repaired owner clears the derived diagnostic");
}

{
	const [concept] = attachValidCardCounts([alpha], [{
		id: "wrong-owner", cards: [{ isValid: false, path: alpha.cardsPath }],
		errors: ["Card owner wrong-owner conflicts with Concept ID concept-alpha"],
	}]);
	assert.equal(concept!.cardCount, 0);
	assert.match(concept!.cardReviewError!, /wrong-owner/, "The declared Cards path reports conflicts even when its owner ID is wrong");
}

console.log("Concept Card availability tests passed.");
