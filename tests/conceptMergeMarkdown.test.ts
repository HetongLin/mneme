import assert from "node:assert/strict";
import { extractMergedPerspective, rewriteManagedCardNavigation } from "../src/services/conceptMergeMarkdown";

function concept(body: string): string {
	return `---\nmneme_type: concept\nmneme_id: concept-old\ncards: '[[Cards/Old|Old Cards]]'\ncustom: keep\n---\n${body}`;
}

for (const newline of ["\n", "\r\n"]) {
	const navigation = "Cards: [[Cards/Old.md|My custom label]]  ";
	const withoutAlias = "Cards:\t[[Cards/Old]]";
	const example = "````markdown\n```\n## Review Cards\nCards: [[Cards/Old]]\n# Example heading\n````";
	const comment = "<!--\n## Review Cards\nCards: [[Cards/Old]]\n# Hidden annotation\n-->";
	const body = [
		"# Title", "## Review Cards", navigation, withoutAlias, "Keep my review notes.",
		"Cards: [[Cards/Other|Other]]", "Cards: [[Cards/Old#heading]]", "    Cards: [[Cards/Old]]",
		"### Custom subsection", "Cards: [[Cards/Old]]", "## Other notes", "Cards: [[Cards/Old]]",
		"Mention [[Cards/Old]] in prose.", example, comment, "",
	].join("\n");
	const original = concept(body).replace(/\n/g, newline);
	const expected = original.replace(navigation, "Cards: [[Cards/New|My custom label]]  ")
		.replace(withoutAlias, "Cards:\t[[Cards/New]]");
	assert.equal(rewriteManagedCardNavigation(original, "Cards/Old.md", "Cards/New.md"), expected);
	assert.equal(rewriteManagedCardNavigation(original, "Cards/Old.md"), original.replace(navigation, "").replace(withoutAlias, ""));
	assert.equal(rewriteManagedCardNavigation(original, "Cards/Old.md", "Cards/Old"), original);
	assert.equal(rewriteManagedCardNavigation(original, undefined, "Cards/New.md"), original);
	assert.equal(rewriteManagedCardNavigation(original, "Cards/Unknown.md", "Cards/New.md"), original);

	const perspective = extractMergedPerspective(concept("# Document title\n\n## Core Meaning\nOriginal meaning.\n\n# Another topic\n## Supporting detail\nKeep detail.\n" + example).replace(/\n/g, newline));
	assert.ok(perspective);
	assert.ok(!perspective.includes("# Document title"));
	assert.match(perspective, /^#### Another topic$/m);
	assert.match(perspective, /^##### Supporting detail$/m);
	assert.ok(perspective.includes(example));
}

assert.equal(extractMergedPerspective(concept("# Title\n\n## Core Meaning\nMeaning")), "#### Core Meaning\nMeaning");
assert.equal(extractMergedPerspective(concept("# Title")), undefined);
assert.equal(extractMergedPerspective(concept("Preface.\n# Authored topic\nKeep this.")), "Preface.\n#### Authored topic\nKeep this.");
assert.equal(extractMergedPerspective(concept("## Meaning\nNo document title.")), "#### Meaning\nNo document title.");
assert.equal(extractMergedPerspective(concept("# Title\n  # Second topic ###\n### Detail")), "#### Second topic ###\n###### Detail");
// Internal indentation is retained; only outer blank/whitespace trimming is inherited.
assert.equal(extractMergedPerspective(concept("# Title\nText\n  # Nested topic\nMore")), "Text\n  #### Nested topic\nMore");

const hidden = "<!--\n# Hidden heading\n## Review Cards\nCards: [[Cards/Old]]\n-->";
assert.equal(extractMergedPerspective(concept("# Title\n" + hidden + "\n## Visible\nText")), hidden + "\n#### Visible\nText");
const closingHeading = concept("# Title\n## Review Cards ##\nCards: [[Cards/Old]]\n");
assert.ok(rewriteManagedCardNavigation(closingHeading, "Cards/Old.md", "Cards/New.md").includes("Cards: [[Cards/New]]"));
const indentedSection = concept("# Title\n- Notes\n  ## Review Cards\n  Cards: [[Cards/Old]]\n");
assert.equal(rewriteManagedCardNavigation(indentedSection, "Cards/Old.md", "Cards/New.md"), indentedSection);
for (const prose of ["Use `<!--` in examples.", "Use \\<!-- literally.", "An unmatched backtick ` and <!-- an inline comment\n# Hidden\n-->"]) {
	const original = concept(`${prose}\n## Review Cards\nCards: [[Cards/Old]]\n`);
	assert.equal(rewriteManagedCardNavigation(original, "Cards/Old.md", "Cards/New.md"), original.replace("Cards: [[Cards/Old]]", "Cards: [[Cards/New]]"));
}
console.log("Concept Merge Markdown tests passed.");
