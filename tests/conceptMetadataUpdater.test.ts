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
	"tags:",
	"  - OOP",
	"  - design patterns",
	"custom_field: keep-me",
	"---",
	"",
	"# Encapsulation",
	"",
].join("\n");

assert.deepEqual(readConceptEditableMetadata(markdown), {
	importance: "normal",
	learningMode: "reviewable",
	tags: ["oop", "design-patterns"],
});

{
	const updated = updateConceptMetadata(markdown, {
		importance: "critical",
		learningMode: "exploratory",
		tags: ["Machine Learning", "#statistics", "statistics"],
	});

	assert.match(updated, /learning_mode: exploratory/);
	assert.match(updated, /importance: critical/);
	assert.match(updated, /tags: \[machine-learning, statistics\]/);
	assert.equal(updated.includes("  - OOP"), false);
	assert.match(updated, /custom_field: keep-me/);
	assert.match(updated, /# Encapsulation/);
}

{
	const updated = updateConceptMetadata(markdown, {
		importance: null,
		learningMode: null,
		tags: null,
	});

	assert.equal(updated.includes("importance:"), false);
	assert.equal(updated.includes("learning_mode:"), false);
	assert.equal(updated.includes("tags:"), false);
	assert.match(updated, /mneme_id: concept-encapsulation/);
}

assert.throws(() => updateConceptMetadata("# No frontmatter\n", { importance: "high" }), /frontmatter/);
