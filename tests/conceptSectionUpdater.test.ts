import assert from "node:assert/strict";
import { updateConceptSections } from "../src/services/conceptSectionUpdater";

{
	const markdown = [
		"# Encapsulation",
		"",
		"## Core Meaning",
		"",
		"Old meaning.",
		"",
		"## Why It Matters",
		"",
		"Old reason.",
		"",
		"## Views",
		"",
		"### Contract view",
		"",
		"Keep this view.",
		"",
	].join("\n");
	const result = updateConceptSections(markdown, {
		coreMeaning: "A Concept hides representation behind a stable interface.",
		whyItMatters: "Internal changes do not force client changes.",
	});

	assert.equal(result.status, "updated");
	assert.match(result.markdown, /## Core Meaning\n\nA Concept hides representation/);
	assert.match(result.markdown, /## Why It Matters\n\nInternal changes/);
	assert.match(result.markdown, /### Contract view\n\nKeep this view\./);
	assert.equal(result.markdown.includes("Old meaning."), false);
}

{
	const markdown = "# Encapsulation\n\n## Core Meaning\n\nStable interface.\n";
	const result = updateConceptSections(markdown, { coreMeaning: "Stable interface." });

	assert.equal(result.status, "unchanged");
	assert.equal(result.markdown, markdown);
}

{
	const markdown = "# Encapsulation\n\n## Views\n\nKeep me.\n";
	const result = updateConceptSections(markdown, { coreMeaning: "Stable interface." });

	assert.match(result.markdown, /## Core Meaning\n\nStable interface\./);
	assert.match(result.markdown, /## Views\n\nKeep me\./);
	assert.ok(result.markdown.indexOf("## Core Meaning") < result.markdown.indexOf("## Views"));
}

assert.throws(
	() => updateConceptSections("# Empty\n", {}),
	/At least one Concept section update is required/,
);
