import assert from "node:assert/strict";
import {
	assignCardGroupConceptId,
	assignConceptId,
	createStableConceptId,
	getCardGroupConceptId,
} from "../src/services/conceptIdEditor";

{
	const markdown = "---\nmneme_type: concept\nimportance: high\n---\n# Encapsulation\n";
	const result = assignConceptId(markdown, { newConceptId: "concept-encapsulation" });

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.equal(result.markdown, "---\nmneme_type: concept\nmneme_id: concept-encapsulation\nimportance: high\n---\n# Encapsulation\n");
	}
}

{
	const markdown = "---\r\nmneme_type: concept\r\nmneme_id: duplicate-old\r\n---\r\n# A\r\n";
	const result = assignConceptId(markdown, {
		expectedConceptId: "duplicate-old",
		newConceptId: "concept-new",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.match(result.markdown, /mneme_id: concept-new\r\n/);
		assert.match(result.markdown, /# A\r\n$/);
	}
}

{
	const markdown = "---\nmneme_type: card_group\nmneme_concept_id: concept-old\n---\n# Cards\n";
	const result = assignCardGroupConceptId(markdown, {
		expectedConceptId: "concept-old",
		newConceptId: "concept-new",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.match(result.markdown, /mneme_concept_id: concept-new/);
		assert.equal(getCardGroupConceptId(result.markdown), "concept-new");
	}
}

{
	const markdown = "---\nmneme_type: concept\nmneme_id: changed\n---\n";
	assert.equal(assignConceptId(markdown, {
		expectedConceptId: "old",
		newConceptId: "concept-new",
	}).status, "conflict");
	assert.equal(assignConceptId(markdown, { newConceptId: "x" }).status, "invalid");
	assert.equal(assignConceptId("# No frontmatter", { newConceptId: "concept-new" }).status, "invalid");
}

{
	const markdown = "---\nmneme_type: concept\nmneme_id: one\nmneme_id: two\n---\n";
	assert.equal(assignConceptId(markdown, {
		expectedConceptId: "one",
		newConceptId: "concept-new",
	}).status, "invalid");
}

assert.equal(createStableConceptId(1_700_000_000_000, 0), "concept_loyw3v28_0000000");
