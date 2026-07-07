import assert from "node:assert/strict";
import { appendConceptView } from "../src/services/conceptViewAppender";

{
	const markdown = "# Encapsulation\n\n## Views\n\n## Source Notes\n\n- [[Notes/Intro]]\n";
	const result = appendConceptView(markdown, {
		body: "A stable boundary lets internals change independently.",
		title: "Change boundary",
	});

	assert.equal(result.status, "appended");
	assert.match(result.markdown, /## Views\n\n### Change boundary\n\nA stable boundary/);
	assert.ok(result.markdown.indexOf("### Change boundary") < result.markdown.indexOf("## Source Notes"));
}

{
	const markdown = "# Encapsulation\n\n## Core Meaning\n\nHide representation.\n";
	const result = appendConceptView(markdown, {
		body: "Think of the public interface as a contract.",
		title: "Contract view",
	});

	assert.match(result.markdown, /## Views\n\n### Contract view/);
}

{
	const markdown = "# Encapsulation\n\n## Views\n\n### Contract view\n\nThink of the public interface as a contract.\n";
	const result = appendConceptView(markdown, {
		body: "Think of the public interface as a contract.",
		title: "contract VIEW",
	});

	assert.equal(result.status, "unchanged");
	assert.equal(result.markdown, markdown);
}

{
	const markdown = "# Encapsulation\n\n## Views\n\n### Contract view\n\nOld body.\n";

	assert.throws(() => appendConceptView(markdown, {
		body: "Different body.",
		title: "Contract view",
	}), /already exists with different content/);
}

{
	const markdown = "# Example\n\n```md\n## Views\n### Fake view\n```\n\n## Views\n";
	const result = appendConceptView(markdown, {
		body: "Real body.",
		title: "Real view",
	});

	assert.match(result.markdown, /```\n\n## Views\n\n### Real view/);
}
