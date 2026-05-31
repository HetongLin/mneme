import assert from "node:assert/strict";
import {
	createConceptPreview,
	extractCoreMeaning,
	extractSection,
	extractWhyItMatters,
	parseConceptTitle,
	stripFrontmatter,
} from "../src/services/conceptMarkdownParser";

const markdown = [
	"---",
	"mneme_type: concept",
	"mneme_id: concept-encapsulation",
	"---",
	"",
	"# Encapsulation",
	"",
	"## Core Meaning",
	"",
	"Encapsulation protects internal representation.",
	"",
	"## Why It Matters",
	"",
	"It reduces coupling and supports local change.",
	"",
	"## Views",
	"",
	"### Java",
	"",
	"Private fields and public methods.",
].join("\n");

{
	const stripped = stripFrontmatter(markdown);

	assert.equal(stripped.includes("mneme_type"), false);
	assert.match(stripped, /# Encapsulation/);
}

{
	assert.equal(parseConceptTitle(markdown, "Mneme/Concepts/Fallback/Concept.md"), "Encapsulation");
}

{
	assert.equal(parseConceptTitle("No heading", "Mneme/Concepts/Fallback-Concept/Concept.md"), "Fallback Concept");
}

{
	assert.equal(extractCoreMeaning(markdown), "Encapsulation protects internal representation.");
}

{
	assert.equal(extractWhyItMatters(markdown), "It reduces coupling and supports local change.");
}

{
	const preview = createConceptPreview(markdown);

	assert.equal(preview.includes("mneme_type"), false);
	assert.match(preview, /Encapsulation protects internal representation/);
}

{
	assert.doesNotThrow(() => extractSection("---\nnot closed", "Core Meaning"));
	assert.equal(parseConceptTitle("---\nnot closed", "Notes/Concept.md"), "Notes");
}

console.log("Concept Markdown parser tests passed.");
