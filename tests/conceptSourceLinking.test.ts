import assert from "node:assert/strict";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	buildConceptUpdateSourceLinks,
	buildExistingConceptSourceLink,
	buildViewSourceLink,
	createConceptSourceLinkId,
	mergeLinkedConceptId,
	normalizeConceptIdForWrittenConcept,
} from "../src/services/conceptSourceLinking";
import { createProposal, createSourceRecord } from "./knowledgeProposalTestUtils";

{
	const proposal = createProposal("proposal-update-source", {
		evidence: [{ excerpt: "New evidence changes the interpretation." }],
		kind: "update_concept",
		payload: {
			conceptId: "concept-encapsulation",
			proposedWhyItMatters: "This update explains why the Concept matters.",
		},
		sourceHash: "update-hash",
		sourcePath: "Notes/New Evidence.md",
	});
	const links = buildConceptUpdateSourceLinks({
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.equal(links.length, 1);
	assert.equal(links[0].relationType, "update");
	assert.equal(links[0].sourcePath, "Notes/New Evidence.md");
}

{
	const proposal = createProposal("proposal-view-source", {
		kind: "add_view",
		payload: {
			conceptId: "concept-encapsulation",
			view: {
				body: "Think of an interface as a contract.",
				evidence: [{ excerpt: "Clients depend on the interface." }],
				sourcePath: "Notes/Interfaces.md",
				title: "Contract view",
			},
		},
		sourceHash: "hash-view",
	});
	const link = buildViewSourceLink({
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.equal(link?.conceptId, "concept-encapsulation");
	assert.equal(link?.relationType, "supporting");
	assert.equal(link?.sourcePath, "Notes/Interfaces.md");
	assert.deepEqual(link?.evidence, [{ excerpt: "Clients depend on the interface." }]);
}

{
	const proposal = createProposal("proposal-existing", {
		kind: "link_existing_concept",
		payload: {
			proposedSourceLink: {
				evidence: [{ excerpt: "A supporting explanation." }],
				relationType: "supporting",
				sourceHash: "hash-a",
				sourcePath: "Notes/Intro.md",
			},
			targetConceptId: "concept-encapsulation",
		},
	});
	const link = buildExistingConceptSourceLink({
		now: "2026-01-02T12:00:00.000Z",
		proposal,
	});

	assert.equal(link?.conceptId, "concept-encapsulation");
	assert.equal(link?.sourcePath, "Notes/Intro.md");
	assert.equal(link?.status, "approved");
}

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

{
	const proposal = createProposal("proposal-f", {
		kind: "new_concept",
		payload: {
			title: "Encapsulation",
		},
	});

	assert.equal(normalizeConceptIdForWrittenConcept({
		proposal,
		targetPaths: ["Mneme/Concepts/Encapsulation/Concept.md"],
	}), "concept-encapsulation");
}

console.log("Concept-source linking tests passed.");
