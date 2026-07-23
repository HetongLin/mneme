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

{
	const conflict = findConceptNameConflict({
		englishName: "Spacing Effect",
		title: "间隔效应",
	}, DEFAULT_SETTINGS, existing);

	assert.equal(conflict?.existing.conceptId, "concept-spacing-effect");
	assert.deepEqual(conflict?.reasons, ["title", "english_name", "concept_id", "path"]);
}

{
	const conflict = findConceptNameConflict({
		englishName: "Distributed Practice",
		title: "分散练习",
	}, DEFAULT_SETTINGS, existing);

	assert.equal(conflict, undefined);
}

{
	const conflict = findConceptNameConflict({
		title: "Spacing Effect",
	}, DEFAULT_SETTINGS, existing);

	assert.equal(conflict?.existing.conceptId, "concept-spacing-effect");
	assert.equal(conflict?.reasons.includes("english_name"), true);
	assert.equal(conflict?.reasons.includes("concept_id"), true);
}

console.log("Concept name conflict tests passed.");
