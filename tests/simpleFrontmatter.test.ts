import assert from "node:assert/strict";
import { parseSimpleFrontmatter } from "../src/services/simpleFrontmatter";

assert.deepEqual(parseSimpleFrontmatter([
	"---",
	"mneme_type: card_group",
	"mneme_concept_id: concept-spacing-effect",
	"concept: '[[Mneme/Concepts/Spacing-Effect]]'",
	"title: \"Spacing Effect\"",
	"---",
	"",
	"# Cards",
].join("\n")), {
	concept: "[[Mneme/Concepts/Spacing-Effect]]",
	mneme_concept_id: "concept-spacing-effect",
	mneme_type: "card_group",
	title: "Spacing Effect",
});

assert.deepEqual(parseSimpleFrontmatter("# No frontmatter"), {});

console.log("Simple frontmatter tests passed.");
