import assert from "node:assert/strict";
import { appendConceptSourceNote } from "../src/services/conceptSourceNoteAppender";

const link = {
	evidence: [{ excerpt: "Interfaces isolate representation changes." }],
	relationType: "supporting" as const,
	sourcePath: "Notes/Intro.md",
};

{
	const markdown = "# Encapsulation\n\n## Source Notes\n\n> [!info]- Source Notes\n> Add source notes here.\n\n## Related Concepts\n";
	const result = appendConceptSourceNote(markdown, link);

	assert.equal(result.status, "appended");
	assert.match(result.markdown, /> - \[\[Notes\/Intro\]\]/);
	assert.match(result.markdown, />   - relation: supporting/);
	assert.equal(result.markdown.includes("Add source notes here."), false);
	assert.equal(result.markdown.includes("## Source Notes\n\n\n"), false);
	assert.ok(result.markdown.indexOf("[[Notes/Intro]]") < result.markdown.indexOf("## Related Concepts"));
}

{
	const markdown = "# Encapsulation\n\n## Core Meaning\n\nHide representation.\n";
	const result = appendConceptSourceNote(markdown, link);

	assert.match(result.markdown, /## Source Notes\n\n> \[!info\]- Source Notes/);
}

{
	const markdown = "# Encapsulation\n\n## Source Notes\n\n> [!info]- Source Notes\n> - [[Notes/Intro|Lecture 1]]\n";
	const result = appendConceptSourceNote(markdown, link);

	assert.equal(result.status, "unchanged");
	assert.equal(result.markdown, markdown);
}
