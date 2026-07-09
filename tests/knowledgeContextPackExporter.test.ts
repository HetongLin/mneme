import assert from "node:assert/strict";
import { createKnowledgeContextPack } from "../src/services/knowledgeContextPackExporter";

const pack = createKnowledgeContextPack([
	{
		markdown: "# Polymorphism\n\n## Core Meaning\n\nOne interface, many implementations.\n\n## Review Cards\n\n- [[Cards/Polymorphism]]",
		summary: {
			conceptId: "concept-polymorphism",
			coreMeaning: "One interface, many implementations.",
			importance: "high",
			learningMode: "reviewable",
			path: "Mneme/Concepts/Polymorphism.md",
			title: "Polymorphism",
		},
	},
	{
		markdown: "# Encapsulation\n\n## Core Meaning\n\nHide representation behind operations.\n\n## Source Notes\n\n- [[Lecture 1]]",
		summary: {
			conceptId: "concept-encapsulation",
			coreMeaning: "Hide representation behind operations.",
			importance: "critical",
			learningMode: "exploratory",
			path: "Mneme/Concepts/Encapsulation.md",
			title: "Encapsulation",
			whyItMatters: "Keeps changes local.",
		},
	},
], {
	generatedAt: "2026-07-09T12:00:00.000Z",
});

assert.equal(pack.title, "Mneme Knowledge Context Pack");
assert.equal(pack.generatedAt, "2026-07-09T12:00:00.000Z");
assert.equal(pack.conceptCount, 2);
assert.deepEqual(Object.keys(pack.files), [
	"README.md",
	"concepts/index.md",
	"concepts/encapsulation.md",
	"concepts/polymorphism.md",
]);
assert.match(pack.files["README.md"] ?? "", /Approved does not mean mastered/);
assert.match(pack.files["README.md"] ?? "", /Cards/);
assert.match(pack.files["README.md"] ?? "", /FSRS scheduler state/);
assert.match(pack.files["README.md"] ?? "", /not a mastery claim/);
assert.match(pack.files["concepts/index.md"] ?? "", /## Encapsulation/);
assert.match(pack.files["concepts/index.md"] ?? "", /Learning mode: exploratory/);
assert.match(pack.files["concepts/index.md"] ?? "", /Importance: critical/);
assert.equal(
	pack.files["concepts/encapsulation.md"],
	"# Encapsulation\n\n## Core Meaning\n\nHide representation behind operations.",
);
assert.equal(
	pack.files["concepts/polymorphism.md"],
	"# Polymorphism\n\n## Core Meaning\n\nOne interface, many implementations.",
);

{
	const duplicatePack = createKnowledgeContextPack([
		{
			markdown: "# C++",
			summary: {
				conceptId: "concept-cpp",
				path: "Concepts/C++.md",
				title: "C++",
			},
		},
		{
			markdown: "# C",
			summary: {
				conceptId: "concept-c",
				path: "Concepts/C.md",
				title: "C",
			},
		},
	]);

	assert.equal(typeof duplicatePack.files["concepts/c.md"], "string");
	assert.equal(typeof duplicatePack.files["concepts/c-2.md"], "string");
}

console.log("Knowledge Context Pack exporter tests passed.");
