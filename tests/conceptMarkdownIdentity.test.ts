import assert from "node:assert/strict";
import {
	getCardGroupConceptIdFromFrontmatter,
	getCardGroupLinkFromConceptFrontmatter,
	getCardGroupPathFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
	getConceptLinkFromCardGroupFrontmatter,
	isMnemeCardGroupFrontmatter,
	isMnemeConceptFrontmatter,
} from "../src/services/conceptMarkdownIdentity";

{
	const frontmatter = {
		mneme_id: "concept-information-gain",
		mneme_type: "concept",
	};

	assert.equal(isMnemeConceptFrontmatter(frontmatter), true);
	assert.equal(getConceptIdFromFrontmatter(frontmatter), "concept-information-gain");
}

{
	const frontmatter = {
		mneme_concept_id: "concept-information-gain",
		mneme_type: "card_group",
	};

	assert.equal(isMnemeCardGroupFrontmatter(frontmatter), true);
	assert.equal(getCardGroupConceptIdFromFrontmatter(frontmatter), "concept-information-gain");
}

{
	assert.doesNotThrow(() => isMnemeConceptFrontmatter(undefined));
	assert.doesNotThrow(() => getConceptIdFromFrontmatter(7));
	assert.equal(isMnemeConceptFrontmatter({ mneme_type: "note" }), false);
	assert.equal(isMnemeCardGroupFrontmatter({ mneme_type: "concept" }), false);
	assert.equal(getConceptIdFromFrontmatter({ mneme_type: "concept" }), undefined);
}

{
	const conceptFrontmatter = {
		cards: "[[Mneme/Cards/Information Gain/Card|Information Gain Cards]]",
		mneme_id: "concept-information-gain",
		mneme_type: "concept",
	};
	const cardFrontmatter = {
		concept: "[[Mneme/Concepts/Information Gain/Concept|Information Gain]]",
		mneme_concept_id: "concept-information-gain",
		mneme_type: "card_group",
	};

	assert.equal(
		getCardGroupLinkFromConceptFrontmatter(conceptFrontmatter),
		"[[Mneme/Cards/Information Gain/Card|Information Gain Cards]]",
	);
	assert.equal(
		getCardGroupPathFromConceptFrontmatter(conceptFrontmatter),
		"Mneme/Cards/Information Gain/Card.md",
	);
	assert.equal(
		getConceptLinkFromCardGroupFrontmatter(cardFrontmatter),
		"[[Mneme/Concepts/Information Gain/Concept|Information Gain]]",
	);
}

{
	const canonicalFrontmatter = {
		cards: "[[Mneme/Cards/Spacing Effect/Cards|Spacing Effect Cards]]",
		cards_folder: "Mneme/Cards/Legacy-Spacing-Effect",
		mneme_id: "concept-spacing-effect",
		mneme_type: "concept",
	};
	const legacyFrontmatter = {
		cards_folder: "Mneme\\Cards\\Legacy-Spacing-Effect",
		mneme_id: "concept-legacy-spacing-effect",
		mneme_type: "concept",
	};

	assert.equal(
		getCardGroupPathFromConceptFrontmatter(canonicalFrontmatter),
		"Mneme/Cards/Spacing Effect/Cards.md",
	);
	assert.equal(
		getCardGroupLinkFromConceptFrontmatter(canonicalFrontmatter),
		canonicalFrontmatter.cards,
	);
	assert.equal(
		getCardGroupPathFromConceptFrontmatter(legacyFrontmatter),
		"Mneme/Cards/Legacy-Spacing-Effect",
	);
}

console.log("Concept Markdown identity tests passed.");
