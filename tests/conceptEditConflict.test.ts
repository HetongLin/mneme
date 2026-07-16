import assert from "node:assert/strict";
import { hasTargetedConceptEditConflict } from "../src/services/conceptEditConflict";

const baseline = {
	coreMeaning: "Stable interface.",
	importance: "normal" as const,
	learningMode: "reviewable" as const,
	retentionTarget: 0.94,
	whyItMatters: "Clients remain stable.",
};
const markdown = [
	"---",
	"mneme_type: concept",
	"learning_mode: reviewable",
	"importance: normal",
	"retention_target: 0.94",
	"---",
	"",
	"# Encapsulation",
	"",
	"## Core Meaning",
	"",
	"Stable interface.",
	"",
	"## Why It Matters",
	"",
	"Clients remain stable.",
	"",
].join("\n");

assert.equal(hasTargetedConceptEditConflict(baseline, markdown), false);
assert.equal(hasTargetedConceptEditConflict(baseline, markdown.replace("Stable interface.", "Changed elsewhere.")), true);
assert.equal(hasTargetedConceptEditConflict(baseline, markdown.replace("importance: normal", "importance: high")), true);
assert.equal(hasTargetedConceptEditConflict(baseline, markdown.replace("retention_target: 0.94", "retention_target: 0.95")), true);
