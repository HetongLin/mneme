import assert from "node:assert/strict";
import {
	addRelatedConceptLink,
	parseRelatedConceptLinks,
	removeRelatedConceptLink,
} from "../src/services/conceptRelatedLinks";

const beta = {
	path: "Mneme/Concepts/Beta.md",
	title: "Beta",
};

{
	const original = "# Alpha\n\n## Core Meaning\n\nAlpha means...\n";
	const added = addRelatedConceptLink(original, beta);

	assert.equal(added.changed, true);
	assert.match(added.markdown, /## Related Concepts\n\n- \[\[Mneme\/Concepts\/Beta\|Beta\]\]/);
	assert.deepEqual(parseRelatedConceptLinks(added.markdown), [{ display: "Beta", target: "Mneme/Concepts/Beta" }]);
	assert.equal(addRelatedConceptLink(added.markdown, beta).changed, false);
}

{
	const markdown = [
		"# Alpha",
		"",
		"## Related Concepts",
		"",
		"This sentence is maintained by the student.",
		"- [[Mneme/Concepts/Beta|Beta]]",
		"",
		"## Source Notes",
		"",
	].join("\n");
	const removed = removeRelatedConceptLink(markdown, "Mneme/Concepts/Beta.md");

	assert.equal(removed.removals, 1);
	assert.match(removed.markdown, /This sentence is maintained by the student\./);
	assert.match(removed.markdown, /## Related Concepts/);
	assert.doesNotMatch(removed.markdown, /\[\[Mneme\/Concepts\/Beta/);
}

{
	const markdown = "# Alpha\n\n## Related Concepts\n\n- [[Beta]] and [[Gamma]] — keep this note\n";
	const removed = removeRelatedConceptLink(markdown, "Beta.md");

	assert.equal(removed.removals, 1);
	assert.match(removed.markdown, /\[\[Gamma\]\] — keep this note/);
}

{
	const markdown = "# Alpha\n\n## Related Concepts\n\n- [[Beta]]\n\n## Source Notes\n\nSource.\n";
	const removed = removeRelatedConceptLink(markdown, "Beta.md");

	assert.equal(removed.changed, true);
	assert.doesNotMatch(removed.markdown, /Related Concepts/);
	assert.match(removed.markdown, /# Alpha\n\n## Source Notes/);
}

{
	const nested = "# Alpha\n\n### Related Concepts\n\n- [[Beta]]\n";

	assert.deepEqual(parseRelatedConceptLinks(nested), []);
}

{
	const fenced = "# Alpha\n\n## Related Concepts\n\n```markdown\n- [[Beta]]\n```\n";

	assert.deepEqual(parseRelatedConceptLinks(fenced), []);
	assert.equal(removeRelatedConceptLink(fenced, "Beta").changed, false);
}

console.log("Concept Related Links tests passed.");
