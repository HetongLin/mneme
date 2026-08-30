import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	applyConceptMergeDraft,
	createManualConceptMergeDraft,
} from "../src/services/conceptMergeDraft";

const first = createConcept("concept-a", "间隔效应 (Spacing Effect)", "Spacing Effect", "First core.", "First why.", "normal", ["memory"]);
const second = createConcept("concept-b", "Distributed Practice", "Distributed Practice", "Second core.", "Second why.", "high", ["learning", "memory"]);
const draft = createManualConceptMergeDraft(first, second, first);

assert.equal(draft.title, "间隔效应");
assert.equal(draft.englishName, "Spacing Effect");
assert.equal(draft.importance, "high");
assert.equal(draft.learningMode, "reviewable");
assert.deepEqual(draft.tags, ["memory", "learning"]);
assert.equal(draft.coreMeaning, "First core.\n\nSecond core.");

const markdown = [
	"---",
	"mneme_type: concept",
	"mneme_id: concept-a",
	"mneme_title: Old",
	"mneme_english_name: Old",
	"learning_mode: exploratory",
	"importance: low",
	"tags: []",
	"---",
	"# Old",
	"",
	"## Core Meaning",
	"",
	"Old core.",
	"",
	"## Why It Matters",
	"",
	"Old why.",
].join("\n");
const merged = applyConceptMergeDraft(markdown, draft);

assert.match(merged, /mneme_id: concept-a/);
assert.match(merged, /mneme_title: "间隔效应"/);
assert.match(merged, /mneme_english_name: "Spacing Effect"/);
assert.match(merged, /# 间隔效应 \(Spacing Effect\)/);
assert.match(merged, /First core\.\n\nSecond core\./);
assert.match(merged, /importance: high/);

const withoutAlias = applyConceptMergeDraft(markdown, {
	...draft,
	englishName: "",
	title: "间隔效应",
});
assert.equal(withoutAlias.includes("mneme_english_name"), false);
assert.match(withoutAlias, /^# 间隔效应$/m);

function createConcept(
	conceptId: string,
	title: string,
	englishName: string,
	coreMeaning: string,
	whyItMatters: string,
	importance: ConceptSummary["importance"],
	tags: string[],
): ConceptSummary {
	return {
		conceptId,
		coreMeaning,
		englishName,
		importance,
		learningMode: conceptId === "concept-a" ? "exploratory" : "reviewable",
		path: `Mneme/Concepts/${conceptId}.md`,
		primaryTitle: title.replace(/\s*\([^)]*\)\s*$/, ""),
		tags,
		title,
		whyItMatters,
	};
}
