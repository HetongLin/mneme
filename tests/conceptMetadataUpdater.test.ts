import assert from "node:assert/strict";
import {
	readConceptEditableMetadata,
	updateConceptMetadata,
} from "../src/services/conceptMetadataUpdater";

const markdown = [
	"---",
	"mneme_type: concept",
	"mneme_id: concept-encapsulation",
	"learning_mode: reviewable",
	"importance: normal",
	"custom_field: keep-me",
	"---",
	"",
	"# Encapsulation",
	"",
].join("\n");

assert.deepEqual(readConceptEditableMetadata(markdown), {
	importance: "normal",
	learningMode: "reviewable",
});

{
	const updated = updateConceptMetadata(markdown, {
		importance: "critical",
		learningMode: "exploratory",
	});

	assert.match(updated, /learning_mode: exploratory/);
	assert.match(updated, /importance: critical/);
	assert.match(updated, /custom_field: keep-me/);
	assert.match(updated, /# Encapsulation/);
}

{
	const updated = updateConceptMetadata(markdown, {
		importance: null,
		learningMode: null,
	});

	assert.equal(updated.includes("importance:"), false);
	assert.equal(updated.includes("learning_mode:"), false);
	assert.match(updated, /mneme_id: concept-encapsulation/);
}

assert.throws(() => updateConceptMetadata("# No frontmatter\n", { importance: "high" }), /frontmatter/);
