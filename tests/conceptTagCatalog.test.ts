import assert from "node:assert/strict";
import {
	buildConceptTagCatalog,
	buildConceptTagCatalogFromTags,
	findSimilarConceptTags,
	normalizeEnglishTagSlug,
	reconcileGeneratedConceptTags,
	suggestConceptTags,
} from "../src/services/conceptTagCatalog";

assert.equal(normalizeEnglishTagSlug(" #Machine Learning "), "machine-learning");
assert.equal(normalizeEnglishTagSlug("representation_learning"), "representation-learning");
assert.equal(normalizeEnglishTagSlug("机器学习"), undefined);

const catalog = buildConceptTagCatalog([
	{ conceptId: "a", path: "a.md", tags: ["machine-learning", "probability"], title: "A" },
	{ conceptId: "b", path: "b.md", tags: ["Machine Learning", "classification"], title: "B" },
]);
assert.deepEqual(catalog, [
	{ tag: "classification", usageCount: 1 },
	{ tag: "machine-learning", usageCount: 2 },
	{ tag: "probability", usageCount: 1 },
]);

assert.deepEqual(
	suggestConceptTags(catalog, { context: "A machine learning classifier", limit: 2 }).map(({ tag }) => tag),
	["machine-learning", "classification"],
);
assert.deepEqual(
	suggestConceptTags(catalog, { query: "prob", selectedTags: [] }).map(({ tag }) => tag),
	["probability"],
);

const similarityCatalog = buildConceptTagCatalogFromTags(["learning", "machine-learning", "probability"]);
assert.equal(findSimilarConceptTags("learning-theory", similarityCatalog)[0]?.tag, "learning");

const reconciled = reconcileGeneratedConceptTags(
	["Machine_Learning", "learning-theory", "机器学习", "probability", "extra"],
	similarityCatalog,
);
assert.deepEqual(reconciled.tags, ["machine-learning", "learning-theory", "probability"]);
assert.equal(reconciled.similar[0]?.proposedTag, "learning-theory");
assert.equal(reconciled.similar[0]?.suggestions[0]?.tag, "learning");

console.log("Concept Tag Catalog tests passed.");
