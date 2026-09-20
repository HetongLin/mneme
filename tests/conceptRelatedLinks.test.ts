import assert from "node:assert/strict";
import {
	addRelatedConceptLink,
	parseRelatedConceptLinks,
	removeRelatedConceptLink,
	replaceRelatedConceptLink,
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

for (const example of [
	"````markdown\n```\n- [[Beta]]\n````",
	"~~~~markdown\n~~~\n- [[Beta]]\n~~~~",
	"````markdown\n```` not a closing fence\n- [[Beta]]\n````",
	"<!--\n- [[Beta]]\n-->", "`[[Beta]]`", "``code ` [[Beta]]``", "\\[[Beta]]", "    [[Beta]]",
]) {
	for (const newline of ["\n", "\r\n"]) {
		const markdown = ("# Alpha\n\n## Related Concepts\n\n" + example + "\n").replace(/\n/g, newline);
		assert.deepEqual(parseRelatedConceptLinks(markdown), [], "Literal examples must not become Related links");
		assert.deepEqual(removeRelatedConceptLink(markdown, "Beta"), { changed: false, markdown, removals: 0 });
		assert.deepEqual(replaceRelatedConceptLink(markdown, "Beta", { path: "Gamma.md", title: "Gamma" }), { changed: false, markdown });
		const added = addRelatedConceptLink(markdown, beta);
		assert.equal(added.changed, true);
		assert.ok(added.markdown.includes(example.replace(/\n/g, newline)));
		assert.deepEqual(parseRelatedConceptLinks(added.markdown), [{ display: "Beta", target: "Mneme/Concepts/Beta" }]);
	}
}

for (const wrapper of [(s: string) => `<!--\n${s}\n-->`, (s: string) => `\`\`\`\`markdown\n\`\`\`\n${s}\n\`\`\`\``]) {
	const example = wrapper("## Related Concepts\n\n- [[Beta]]");
	const markdown = `# Alpha\n${example}\n\n## Related Concepts\n\n- [[Gamma]]\n`;
	assert.deepEqual(parseRelatedConceptLinks(markdown), [{ target: "Gamma", display: undefined }]);
	assert.ok(removeRelatedConceptLink(markdown, "Gamma").markdown.includes(example));
}

{
	const markdown = "---\nexample: |\n  ## Related Concepts\n  - [[Fake]]\n---\n# Alpha\n## Related Concepts\n- [[Beta]] <!-- [[Beta]] --> `[[Beta]]` \\[[Beta]]\n";
	const removed = removeRelatedConceptLink(markdown, "Beta");
	assert.equal(removed.removals, 1);
	assert.equal(removed.markdown, markdown.replace("- [[Beta]] <!--", "-  <!--"));
	assert.deepEqual(parseRelatedConceptLinks(removed.markdown), []);
}

{
	const example = "```markdown\n-\n- [[Beta]]\n```\n<!--\n## Fake end\n- [[Beta]]\n-->";
	const markdown = "# Alpha\n## Related Concepts\n- [[Beta]]\n" + example + "\n## Source Notes\n- [[Beta]]\n";
	const removed = removeRelatedConceptLink(markdown, "Beta");
	assert.equal(removed.removals, 1);
	assert.ok(removed.markdown.includes(example));
	assert.ok(removed.markdown.endsWith("## Source Notes\n- [[Beta]]\n"));
}

for (const open of ["```markdown", "<!--"]) {
	for (const prefix of ["# Alpha\n", "# Alpha\n## Related Concepts\n"]) {
		assert.throws(() => addRelatedConceptLink(prefix + open + "\nexample", beta), /Close.*before adding Related/);
	}
	const safeSection = `# Alpha\n## Related Concepts\n\n## Source Notes\n${open}\nexample`;
	assert.equal(addRelatedConceptLink(safeSection, beta).changed, true);
}

{
	const markdown = "# Alpha\n## Related Concepts\n🧠 [[Beta]] `[[Beta]]` <!-- [[Beta]] --> and [[Beta]]\n";
	const removed = removeRelatedConceptLink(markdown, "Beta");
	assert.equal(removed.removals, 2);
	assert.ok(removed.markdown.includes("🧠  `[[Beta]]` <!-- [[Beta]] --> and "));
}

console.log("Concept Related Links tests passed.");
