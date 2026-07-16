import assert from "node:assert/strict";
import {
	canAnalyzeCurrentNote,
	canGenerateCardsFromCurrentConcept,
	canOpenCardsForCurrentConcept,
	classifyCurrentNote,
	isPathInsideFolder,
} from "../src/services/currentNoteActionPolicy";

const baseContext = {
	cardsFolder: "Mneme/Cards",
	conceptsFolder: "Mneme/Concepts",
};

assert.equal(classifyCurrentNote(baseContext), "none");
assert.equal(classifyCurrentNote({ ...baseContext, extension: "pdf", path: "Sources/Book.pdf" }), "non_markdown");
assert.equal(classifyCurrentNote({ ...baseContext, extension: "md", path: "Sources/Bayes.md" }), "source_note");
assert.equal(classifyCurrentNote({
	...baseContext,
	extension: "md",
	hasConceptId: true,
	learningMode: "reviewable",
	path: "Mneme/Concepts/Bayes-Theorem.md",
}), "reviewable_concept");
assert.equal(classifyCurrentNote({
	...baseContext,
	extension: "md",
	hasConceptId: true,
	learningMode: "exploratory",
	path: "Mneme/Concepts/Bayesian-Reasoning.md",
}), "exploratory_concept");
assert.equal(classifyCurrentNote({
	...baseContext,
	extension: "md",
	path: "Mneme/Concepts/Incomplete.md",
}), "mneme_internal");
assert.equal(classifyCurrentNote({
	...baseContext,
	extension: "md",
	path: "Mneme/Cards/Bayes-Theorem/Cards.md",
}), "mneme_internal");

assert.equal(canAnalyzeCurrentNote("source_note"), true);
assert.equal(canAnalyzeCurrentNote("reviewable_concept"), false);
assert.equal(canAnalyzeCurrentNote("mneme_internal"), false);
assert.equal(canGenerateCardsFromCurrentConcept("reviewable_concept"), true);
assert.equal(canGenerateCardsFromCurrentConcept("exploratory_concept"), false);
assert.equal(canGenerateCardsFromCurrentConcept("source_note"), false);
assert.equal(canOpenCardsForCurrentConcept("reviewable_concept"), true);
assert.equal(canOpenCardsForCurrentConcept("exploratory_concept"), true);
assert.equal(canOpenCardsForCurrentConcept("source_note"), false);

assert.equal(isPathInsideFolder("mneme\\cards\\Bayes\\Cards.md", "Mneme/Cards/"), true);
assert.equal(isPathInsideFolder("Mneme/Cardstock/Notes.md", "Mneme/Cards"), false);

console.log("Current note action policy tests passed.");
