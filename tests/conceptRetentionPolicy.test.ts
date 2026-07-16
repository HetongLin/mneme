import assert from "node:assert/strict";
import {
	formatRetentionTarget,
	parseConceptRetentionTarget,
} from "../src/services/conceptRetentionPolicy";

assert.equal(parseConceptRetentionTarget(0.7), 0.7);
assert.equal(parseConceptRetentionTarget("0.94"), 0.94);
assert.equal(parseConceptRetentionTarget(0.98), 0.98);
assert.equal(parseConceptRetentionTarget(0.699), undefined);
assert.equal(parseConceptRetentionTarget(0.981), undefined);
assert.equal(parseConceptRetentionTarget("not-a-number"), undefined);
assert.equal(parseConceptRetentionTarget(""), undefined);
assert.equal(formatRetentionTarget(0.9), "0.90");

console.log("Concept retention policy tests passed.");
