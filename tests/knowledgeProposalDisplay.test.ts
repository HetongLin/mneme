import assert from "node:assert/strict";
import {
	getProposalEvidenceCount,
	getProposalEvidenceItems,
	getProposalHighlights,
	getProposalPreview,
	getProposalSubtitle,
	getProposalTitle,
} from "../src/services/knowledgeProposalDisplay";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	const proposal = createProposal("proposal-a", {
		ai: {
			confidence: 0.97,
			normalizedAt: "2026-01-01T12:00:00.000Z",
			rationale: "Internal rationale",
			schemaVersion: "mneme.ai.proposals.v1",
		},
		kind: "new_concept",
		payload: {
			summary: "A boundary around representation details.",
			title: "Encapsulation",
		},
		sourcePath: "Notes/OOP.md",
		status: "written",
	});
	const primaryText = [
		getProposalTitle(proposal),
		getProposalSubtitle(proposal),
		getProposalPreview(proposal),
	].join(" ");

	assert.equal(getProposalTitle(proposal), "Encapsulation");
	assert.equal(getProposalPreview(proposal), "A boundary around representation details.");
	assert.equal(primaryText.includes("written"), false);
	assert.equal(primaryText.includes("Status"), false);
	assert.equal(primaryText.includes("confidence"), false);
	assert.equal(primaryText.includes("0.97"), false);
	assert.equal(primaryText.includes("mneme.ai.proposals.v1"), false);
	assert.equal(primaryText.includes("Internal rationale"), false);
}

{
	const proposal = createProposal("proposal-b", {
		kind: "new_card",
		payload: {
			card: {
				back: "Encapsulation hides representation details.",
				cardType: "definition",
				evidence: [{ excerpt: "Encapsulation hides details." }],
				front: "What is encapsulation?",
			},
			conceptId: "concept-encapsulation",
			conceptTitle: "Encapsulation",
		},
	});

	assert.equal(getProposalTitle(proposal), "Encapsulation - Definition.md");
	assert.deepEqual(getProposalHighlights(proposal).slice(0, 4), [
		{ label: "Markdown File", value: "Encapsulation - Definition.md" },
		{ label: "Card Type", value: "definition" },
		{ label: "Front", value: "What is encapsulation?" },
		{ label: "Back", value: "Encapsulation hides representation details." },
	]);
	assert.equal(getProposalEvidenceCount(proposal), 1);
}

{
	const proposal = createProposal("proposal-c", {
		kind: "revise_card",
		payload: {
			cardId: "encapsulation-basic",
			revisedCard: {
				back: "Updated answer",
				front: "Updated question",
			},
		},
	});

	assert.equal(getProposalTitle(proposal), "Revise Card: encapsulation-basic");
}

{
	const proposal = createProposal("proposal-d", {
		kind: "new_concept",
		payload: undefined,
	});

	assert.equal(getProposalTitle(proposal), "New Concept");
	assert.equal(getProposalPreview(proposal), "No concept summary yet.");
}

{
	const proposal = createProposal("proposal-e", {
		kind: "new_concept",
		payload: 42 as never,
	});

	assert.doesNotThrow(() => getProposalTitle(proposal));
	assert.doesNotThrow(() => getProposalSubtitle(proposal));
	assert.doesNotThrow(() => getProposalPreview(proposal));
}

{
	const proposal = createProposal("proposal-f", {
		evidence: [{ excerpt: "Top-level evidence" }],
		kind: "new_concept",
		payload: {
			proposedCards: [{
				back: "Answer",
				evidence: [{ excerpt: "Nested evidence" }],
				front: "Question",
			}],
			proposedViews: [{
				body: "View body",
				evidence: [{ excerpt: "View evidence" }],
				title: "View",
			}],
			title: "Evidence Count",
		},
		sourcePath: "Notes/Source.md",
	});

	assert.equal(getProposalEvidenceCount(proposal), 3);
	assert.deepEqual(getProposalEvidenceItems(proposal), [
		{
			excerpt: "Top-level evidence",
			sourcePath: "Notes/Source.md",
		},
		{
			excerpt: "Nested evidence",
			sourcePath: "Notes/Source.md",
		},
		{
			excerpt: "View evidence",
			sourcePath: "Notes/Source.md",
		},
	]);
}

{
	const proposal = createProposal("proposal-g", {
		evidence: [{ excerpt: "Repeated evidence", heading: "Intro", lineStart: 2 }],
		kind: "new_card",
		payload: {
			card: {
				back: "A",
				evidence: [
					{ excerpt: "Repeated evidence", heading: "Intro", lineStart: 2 },
					{ excerpt: "Card-specific evidence", lineStart: 5, lineEnd: 7 },
				],
				front: "Q",
				sourcePath: "Mneme/Concepts/Card Source.md",
			},
			conceptId: "concept-a",
		},
		sourcePath: "Notes/Original.md",
	});

	assert.deepEqual(getProposalEvidenceItems(proposal), [
		{
			excerpt: "Repeated evidence",
			heading: "Intro",
			lineStart: 2,
			sourcePath: "Notes/Original.md",
		},
		{
			excerpt: "Repeated evidence",
			heading: "Intro",
			lineStart: 2,
			sourcePath: "Mneme/Concepts/Card Source.md",
		},
		{
			excerpt: "Card-specific evidence",
			lineEnd: 7,
			lineStart: 5,
			sourcePath: "Mneme/Concepts/Card Source.md",
		},
	]);
}

console.log("Knowledge proposal display tests passed.");
