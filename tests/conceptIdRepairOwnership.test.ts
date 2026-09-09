import assert from "node:assert/strict";
import { assertConceptIdRepairOwnership } from "../src/services/conceptIdRepairOwnership";
import type { ConceptIdentityIssue } from "../src/models/conceptLibrary";
const issue: ConceptIdentityIssue = { kind: "duplicate_id", conceptId: "old-id", path: "Concepts/A.md", cardsPath: "Cards/A.md", title: "A" };
const concept = { mneme_type: "concept", mneme_id: "old-id", cards: "[[Cards/A]]" };
const group = { mneme_type: "card_group", mneme_concept_id: "old-id" };
const other = (frontmatter: Record<string, unknown>) => [{ path: "Concepts/B.md", frontmatter: { mneme_type: "concept", ...frontmatter } }];

assert.doesNotThrow(() => assertConceptIdRepairOwnership(issue, "new-id", concept, group, []));
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", concept, { ...group, mneme_concept_id: "foreign-id" }, []), /belongs to another Concept/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", concept, group, other({ cards: "[[Cards/A.md|Shared]]", mneme_id: "old-id" })), /Another Concept links/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", concept, group, other({ cards_folder: "Cards" })), /Another Concept links/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", concept, group, other({ mneme_id: "new-id" })), /already exists/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", { ...concept, cards: "[[Cards/B]]" }, group, []), /linked Card Group changed/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", { ...concept, mneme_id: "changed-id" }, group, []), /identity changed/);
assert.throws(() => assertConceptIdRepairOwnership(issue, "old-id", concept, group, []), /already exists/);
for (const invalid of [undefined, { mneme_type: "concept" }, { mneme_type: "card" }, []]) {
	assert.throws(() => assertConceptIdRepairOwnership(issue, "new-id", concept, invalid, []), /missing or invalid/);
}

const missing: ConceptIdentityIssue = { ...issue, kind: "missing_id", conceptId: undefined };
const withoutId = { mneme_type: "concept", cards: "[[Cards/A]]" };
assert.doesNotThrow(() => assertConceptIdRepairOwnership(missing, "old-id", withoutId, group, []));
assert.doesNotThrow(() => assertConceptIdRepairOwnership(missing, "new-id", withoutId, group, []));
assert.throws(() => assertConceptIdRepairOwnership(missing, "new-id", withoutId, group, other({ mneme_id: "old-id" })), /belongs to another Concept/);
assert.doesNotThrow(() => assertConceptIdRepairOwnership(missing, "new-id", withoutId, { mneme_type: "card_group" }, []));
assert.doesNotThrow(() => assertConceptIdRepairOwnership({ ...missing, cardsPath: undefined }, "new-id", { mneme_type: "concept" }, undefined, []));
console.log("Concept ID repair ownership tests passed.");
