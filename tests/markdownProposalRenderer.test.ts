import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import {
	createTemporaryWriterCardId,
	renderMarkdownProposal,
} from "../src/services/markdownProposalRenderer";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	const proposal = createProposal("proposal-a", {
		kind: "new_concept",
		payload: {
			coreMeaning: "Encapsulation protects internal representation.",
			title: "Encapsulation",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);

	assert.equal(result.status, "rendered");
	assert.equal(result.status === "rendered" ? result.drafts[0].targetPath : "", "Mneme/Concepts/Encapsulation/Concept.md");
	assert.match(result.status === "rendered" ? result.drafts[0].content : "", /# Encapsulation/);
}

{
	const proposal = createProposal("proposal-b", {
		kind: "new_concept",
		payload: {
			coreMeaning: "Abstraction hides unnecessary implementation detail.",
			title: "Abstraction",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);

	assert.equal(result.status, "rendered");
	assert.match(result.status === "rendered" ? result.drafts[0].content : "", /## Core Meaning\n\nAbstraction hides/);
}

{
	const proposal = createProposal("proposal-c", {
		kind: "new_concept",
		payload: {
			proposedSourceLinks: [{
				evidence: [{ excerpt: "Objects hide their representation behind methods." }],
				relationType: "origin",
				sourcePath: "Software Construction/Chapter 7.md",
			}],
			title: "Objects",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);

	assert.equal(result.status, "rendered");
	assert.match(result.status === "rendered" ? result.drafts[0].content : "", /\[\[Software Construction\/Chapter 7\]\]/);
	assert.match(result.status === "rendered" ? result.drafts[0].content : "", /relation: origin/);
}

{
	const proposal = createProposal("proposal-d", {
		kind: "new_card",
		payload: {
			card: {
				back: "Encapsulation bundles data and operations while hiding representation.",
				front: "What is encapsulation?",
				rubric: "Mention bundling and hidden representation.",
			},
			conceptId: "concept-encapsulation",
			conceptTitle: "Encapsulation",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);

	assert.equal(result.status, "rendered");
	const content = result.status === "rendered" ? result.drafts[0].content : "";
	const parsedCards = parseMnemeCards(content);

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0].isValid, true);
	assert.equal(parsedCards[0].hasExplicitCardId, true);
	assert.equal(parsedCards[0].front, "What is encapsulation?");
}

{
	const proposal = createProposal("proposal-e", {
		kind: "new_card",
		payload: {
			card: {
				back: "Answer",
				front: "Question",
			},
			conceptId: "concept-a",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);
	const content = result.status === "rendered" ? result.drafts[0].content : "";

	assert.equal(content.includes("fsrs"), false);
	assert.equal(content.includes("stability"), false);
	assert.equal(content.includes("difficulty"), false);
	assert.equal(content.includes("dueAt"), false);
}

{
	const proposal = createProposal("proposal-f", {
		kind: "update_concept",
		payload: {
			conceptId: "concept-a",
			proposedSummary: "Updated summary",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);

	assert.equal(result.status, "unsupported");
}

{
	assert.equal(
		createTemporaryWriterCardId("Concept", "What is x?", "proposal-a"),
		createTemporaryWriterCardId("Concept", "What is x?", "proposal-a"),
	);
}

console.log("Markdown proposal renderer tests passed.");
