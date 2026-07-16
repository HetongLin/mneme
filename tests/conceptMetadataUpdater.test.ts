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
	"retention_target: 0.94",
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
	retentionTarget: 0.94,
	tags: ["oop", "design-patterns"],
});

{
	const updated = updateConceptMetadata(markdown, {
		importance: "critical",
		learningMode: "exploratory",
		retentionTarget: 0.96,
		tags: ["Machine Learning", "#statistics", "statistics"],
	});

	assert.match(updated, /learning_mode: exploratory/);
	assert.match(updated, /importance: critical/);
	assert.match(updated, /retention_target: 0\.96/);
	assert.match(updated, /tags: \[machine-learning, statistics\]/);
	assert.equal(updated.includes("  - OOP"), false);
	assert.match(updated, /custom_field: keep-me/);
	assert.match(updated, /# Encapsulation/);
}

{
	const updated = updateConceptMetadata(markdown, { importance: "high" });

	assert.match(updated, /importance: high/);
	assert.match(updated, /retention_target: 0\.94/);
}

{
	const updated = updateConceptMetadata(markdown, {
		importance: null,
		learningMode: null,
		retentionTarget: null,
		tags: null,
	});

	assert.equal(updated.includes("importance:"), false);
	assert.equal(updated.includes("learning_mode:"), false);
	assert.equal(updated.includes("retention_target:"), false);
	assert.equal(updated.includes("tags:"), false);
	assert.match(updated, /mneme_id: concept-encapsulation/);
}

assert.throws(() => updateConceptMetadata("# No frontmatter\n", { importance: "high" }), /frontmatter/);
assert.throws(() => updateConceptMetadata(markdown, { retentionTarget: 0.99 }), /between 0\.70 and 0\.98/);
