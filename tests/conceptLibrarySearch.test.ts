import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	canGenerateCardsFromConcept,
	filterConceptSummaries,
	sortConceptSummaries,
} from "../src/services/conceptLibrarySearch";

const concepts: ConceptSummary[] = [
	{
		conceptId: "concept-b",
		coreMeaning: "Many forms through one interface.",
		importance: "normal",
		learningMode: "reviewable",
		path: "Mneme/Concepts/Polymorphism/Concept.md",
		title: "Polymorphism",
		updatedAt: 200,
	},
	{
		conceptId: "concept-a",
		coreMeaning: "Hide representation behind operations.",
		importance: "critical",
		learningMode: "exploratory",
		path: "Mneme/Concepts/Encapsulation/Concept.md",
		title: "Encapsulation",
		updatedAt: 300,
		whyItMatters: "Keeps changes local.",
	},
	{
		conceptId: "concept-c",
		importance: "low",
		path: "Mneme/Concepts/Abstraction/Concept.md",
		title: "Abstraction",
		updatedAt: 100,
	},
];

{
	assert.equal(filterConceptSummaries(concepts, { query: "" }).length, 3);
}

{
	assert.equal(canGenerateCardsFromConcept(concepts[0]!), true);
	assert.equal(canGenerateCardsFromConcept(concepts[1]!), false);
	assert.equal(canGenerateCardsFromConcept(concepts[2]!), true);
}

{
	assert.deepEqual(
		filterConceptSummaries(concepts, { query: "poly" }).map((concept) => concept.title),
		["Polymorphism"],
	);
}

{
	assert.deepEqual(
		filterConceptSummaries(concepts, { query: "abstraction" }).map((concept) => concept.title),
		["Abstraction"],
	);
}

{
	assert.deepEqual(
		filterConceptSummaries(concepts, { query: "representation" }).map((concept) => concept.title),
		["Encapsulation"],
	);
}

{
	assert.deepEqual(
		filterConceptSummaries(concepts, { learningMode: "reviewable" }).map((concept) => concept.title),
		["Polymorphism"],
	);
}

{
	assert.deepEqual(
		filterConceptSummaries(concepts, { importance: "critical" }).map((concept) => concept.title),
		["Encapsulation"],
	);
}

{
	assert.deepEqual(
		sortConceptSummaries(concepts, "title").map((concept) => concept.title),
		["Abstraction", "Encapsulation", "Polymorphism"],
	);
}

{
	assert.deepEqual(
		sortConceptSummaries(concepts, "updatedAt_desc").map((concept) => concept.title),
		["Encapsulation", "Polymorphism", "Abstraction"],
	);
}

{
	assert.deepEqual(
		sortConceptSummaries(concepts, "importance_desc").map((concept) => concept.title),
		["Encapsulation", "Polymorphism", "Abstraction"],
	);
}

{
	assert.doesNotThrow(() => filterConceptSummaries([{ conceptId: "x", path: "x", title: "X" }], { query: "x" }));
}

console.log("Concept Library search tests passed.");
