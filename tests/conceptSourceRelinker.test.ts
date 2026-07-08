import assert from "node:assert/strict";
import { relinkConceptSourcePath } from "../src/services/conceptSourceRelinker";

{
	const markdown = [
		"# Concept",
		"",
		"Outside [[Notes/Old]] stays.",
		"",
		"## Source Notes",
		"",
		"> - [[Notes/Old|Lecture alias]]",
		"> - [[Notes/Old.md]]",
		"",
		"## Related Concepts",
		"",
		"[[Notes/Old]]",
	].join("\n");
	const result = relinkConceptSourcePath(markdown, "Notes/Old.md", "Notes/New.md");
	assert.equal(result.status, "relinked");
	assert.equal(result.replacements, 2);
	assert.match(result.markdown, /\[\[Notes\/New\|Lecture alias\]\]/);
	assert.match(result.markdown, /\[\[Notes\/New\]\]/);
	assert.equal(result.markdown.match(/\[\[Notes\/Old\]\]/g)?.length, 2);
}

{
	const markdown = "# Concept\r\n\r\n## Source Notes\r\n\r\n> - [[Notes/Old]]\r\n";
	const result = relinkConceptSourcePath(markdown, "Notes/Old.md", "Notes/New.md");
	assert.equal(result.status, "relinked");
	assert.equal(result.markdown, "# Concept\r\n\r\n## Source Notes\r\n\r\n> - [[Notes/New]]\r\n");
}

{
	const markdown = "# Concept\n\n## Core Meaning\n\nNo Source Notes section.\n";
	const result = relinkConceptSourcePath(markdown, "Notes/Old.md", "Notes/New.md");
	assert.equal(result.status, "not_found");
	assert.equal(result.markdown, markdown);
}

console.log("Concept Source relinker tests passed.");
