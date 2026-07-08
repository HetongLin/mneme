import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	createConceptDuplicatePairKey,
	detectConceptDuplicates,
} from "../src/services/conceptDuplicateDetector";

{
	const candidates = detectConceptDuplicates([
		createConcept("concept-a", "Information Gain", "Information gain measures entropy reduction after a split."),
		createConcept("concept-b", "information-gain", "A different explanation."),
	]);

	assert.equal(candidates.length, 1);
	assert.equal(candidates[0]?.score, 1);
	assert.deepEqual(candidates[0]?.reasons, ["Same normalized title"]);
	assert.equal(candidates[0]?.pairKey, '["concept-a","concept-b"]');
}

{
	const core = "Encapsulation bundles data with operations and hides internal representation from callers.";
	const candidates = detectConceptDuplicates([
		createConcept("concept-a", "Encapsulation", core),
		createConcept("concept-b", "Information Hiding", core),
	]);

	assert.equal(candidates.length, 1);
	assert.equal(candidates[0]?.reasons.includes("Same normalized Core Meaning"), true);
}

{
	const candidates = detectConceptDuplicates([
		createConcept("concept-a", "Bayes Theorem", "Updates a probability after observing evidence."),
		createConcept("concept-b", "Bayesian Networks", "Represents conditional dependencies in a graph."),
		createConcept("concept-c", "Entropy", "Measures uncertainty in a distribution."),
	]);

	assert.deepEqual(candidates, []);
}

{
	const candidates = detectConceptDuplicates([
		createConcept("concept-a", "信息增益", "信息增益衡量划分后熵的减少程度"),
		createConcept("concept-b", "信息增益", "信息增益用于决策树选择划分"),
	]);

	assert.equal(candidates.length, 1);
}

assert.equal(createConceptDuplicatePairKey("z", "a"), '["a","z"]');
assert.notEqual(
	createConceptDuplicatePairKey("a::b", "c"),
	createConceptDuplicatePairKey("a", "b::c"),
);

function createConcept(conceptId: string, title: string, coreMeaning: string): ConceptSummary {
	return {
		conceptId,
		coreMeaning,
		path: `${conceptId}.md`,
		title,
	};
}
