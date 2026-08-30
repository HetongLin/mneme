import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { findConceptNameConflict } from "../src/services/conceptNameConflict";

const existing = [{
	conceptId: "concept-spacing-effect",
	coreMeaning: "Distributed practice improves long-term retention.",
	englishName: "Spacing Effect",
	path: "Mneme/Concepts/间隔效应-(Spacing-Effect).md",
	primaryTitle: "间隔效应",
	title: "间隔效应 (Spacing Effect)",
}];
const aliasSettings = { ...DEFAULT_SETTINGS, suggestEnglishAliases: true };

{
	const conflict = findConceptNameConflict({
		coreMeaning: "Incoming **Core Meaning**.",
		englishName: "Spacing Effect",
		title: "间隔效应",
	}, aliasSettings, existing);

	assert.equal(conflict?.existing.conceptId, "concept-spacing-effect");
	assert.equal(conflict?.candidate.coreMeaning, "Incoming **Core Meaning**.");
	assert.deepEqual(conflict?.reasons, ["title", "english_alias", "path"]);
}

{
	const conflict = findConceptNameConflict({
		englishName: "Distributed Practice",
		title: "分散练习",
	}, aliasSettings, existing);

	assert.equal(conflict, undefined);
}

{
	const conflict = findConceptNameConflict({
		title: "Spacing Effect",
	}, DEFAULT_SETTINGS, existing);

	assert.equal(conflict?.existing.conceptId, "concept-spacing-effect");
	assert.equal(conflict?.reasons.includes("english_alias"), true);
	assert.equal(conflict?.reasons.includes("path"), false);
}

console.log("Concept name conflict tests passed.");
