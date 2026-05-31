import assert from "node:assert/strict";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	createConceptSourceLinkId,
	mergeLinkedConceptId,
	normalizeConceptIdForWrittenConcept,
} from "../src/services/conceptSourceLinking";
import { createProposal, createSourceRecord } from "./knowledgeProposalTestUtils";

{
	const first = createConceptSourceLinkId("concept-a", "Notes/Intro.md", "origin");
	const second = createConceptSourceLinkId("concept-a", "Notes/Intro.md", "origin");

	assert.equal(first, second);
}

{
	const first = createConceptSourceLinkId("concept-a", "Notes/Intro.md", "origin");
	const second = createConceptSourceLinkId("concept-a", "Notes/Other.md", "origin");

	assert.notEqual(first, second);
}

{
	const proposal = createProposal("proposal-a", {
		kind: "new_concept",
		payload: {
			proposedSourceLinks: [{
				evidence: [{ excerpt: "Objects hide representation." }],
				relationType: "supporting",
				sourceHash: "hash-a",
				sourcePath: "Notes/Intro.md",
			}],
			title: "Encapsulation",
		},
		sourceHash: "proposal-hash",
	});

	const links = buildConceptSourceLinksFromNewConceptProposal({
		conceptId: "concept-a",
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.equal(links.length, 1);
	assert.equal(links[0].relationType, "supporting");
	assert.deepEqual(links[0].evidence, [{ excerpt: "Objects hide representation." }]);
	assert.equal(links[0].sourceHash, "hash-a");
}

{
	const proposal = createProposal("proposal-b", {
		evidence: [{ excerpt: "Top-level source evidence." }],
		kind: "new_concept",
		payload: {
			title: "Encapsulation",
		},
		sourceHash: "proposal-hash",
		sourcePath: "Notes/Intro.md",
	});

	const links = buildConceptSourceLinksFromNewConceptProposal({
		conceptId: "concept-a",
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.equal(links.length, 1);
	assert.equal(links[0].relationType, "origin");
	assert.equal(links[0].sourcePath, "Notes/Intro.md");
	assert.deepEqual(links[0].evidence, [{ excerpt: "Top-level source evidence." }]);
}

{
	const proposal = createProposal("proposal-c", {
		kind: "new_concept",
		payload: {
			title: "Encapsulation",
		},
	});

	const links = buildConceptSourceLinksFromNewConceptProposal({
		conceptId: "concept-a",
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.deepEqual(links, []);
}

{
	const record = createSourceRecord("Notes/Intro.md");
	const updatedRecord = mergeLinkedConceptId(record, "concept-a");

	assert.deepEqual(updatedRecord.linkedConceptIds, ["concept-a"]);
	assert.deepEqual(record.linkedConceptIds, []);
}

{
	const record = {
		...createSourceRecord("Notes/Intro.md"),
		linkedConceptIds: ["concept-a"],
	};
	const updatedRecord = mergeLinkedConceptId(record, "concept-a");

	assert.deepEqual(updatedRecord.linkedConceptIds, ["concept-a"]);
	assert.notEqual(updatedRecord, record);
}

{
	const proposal = createProposal("proposal-d", {
		conceptId: "concept-existing",
	});

	assert.equal(normalizeConceptIdForWrittenConcept({
		proposal,
		targetPaths: ["Mneme/Concepts/Encapsulation/Concept.md"],
	}), "concept-existing");
}

{
	const proposal = createProposal("proposal-e");

	assert.equal(normalizeConceptIdForWrittenConcept({
		proposal,
		targetPaths: ["Mneme/Concepts/Encapsulation/Concept.md"],
	}), "Mneme/Concepts/Encapsulation/Concept.md");
}

console.log("Concept-source linking tests passed.");
