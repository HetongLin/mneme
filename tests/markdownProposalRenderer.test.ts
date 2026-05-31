import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import {
	createTemporaryWriterCardId,
	renderMarkdownProposal,
} from "../src/services/markdownProposalRenderer";
import { createProposal } from "./knowledgeProposalTestUtils";

function getFirstDraftContent(result: ReturnType<typeof renderMarkdownProposal>): string {
	return result.status === "rendered" ? result.drafts[0].content : "";
}

{
	const proposal = createProposal("proposal-a", {
		kind: "new_concept",
		payload: {
			coreMeaning: "Encapsulation protects internal representation.",
			learningMode: "reviewable",
			suggestedImportance: "normal",
			title: "Encapsulation",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS);
	const content = getFirstDraftContent(result);

	assert.equal(result.status, "rendered");
	assert.equal(result.status === "rendered" ? result.drafts[0].targetPath : "", "Mneme/Concepts/Encapsulation/Concept.md");
	assert.match(content, /^---\nmneme_type: concept\nmneme_id: concept-encapsulation\nmneme_version: 1/m);
	assert.match(content, /cards: "\[\[Mneme\/Cards\/Encapsulation\/Card\|Encapsulation Cards\]\]"/);
	assert.match(content, /learning_mode: reviewable/);
	assert.match(content, /importance: normal/);
	assert.match(content, /# Encapsulation/);
	assert.match(content, /## Core Meaning\n\nEncapsulation protects/);
	assert.match(content, /## Review\n\n> \[!note\]- Review Cards/);
}

{
	const proposal = createProposal("proposal-b", {
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
	const content = getFirstDraftContent(renderMarkdownProposal(proposal, DEFAULT_SETTINGS));

	assert.match(content, /> \[!info\]- Source Notes/);
	assert.match(content, /> - \[\[Software Construction\/Chapter 7\]\]/);
	assert.match(content, />   - relation: origin/);
	assert.match(content, />   - evidence: Objects hide their representation behind methods\./);
}

{
	const proposal = createProposal("proposal-c", {
		kind: "new_concept",
		payload: {
			proposedCards: [{
				back: "Do not dump this answer.",
				front: "Do not dump this question?",
				rubric: "Do not dump this rubric.",
			}],
			title: "No Card Dump",
		},
		sourceHash: "source-hash-that-should-not-render",
		status: "approved",
	});
	const content = getFirstDraftContent(renderMarkdownProposal(proposal, DEFAULT_SETTINGS));

	assert.equal(content.includes("source-hash-that-should-not-render"), false);
	assert.equal(content.includes("proposal-c"), false);
	assert.equal(content.includes("linkId"), false);
	assert.equal(content.includes("fsrsState"), false);
	assert.equal(content.includes("dueAt"), false);
	assert.equal(content.includes("stability"), false);
	assert.equal(content.includes("difficulty"), false);
	assert.equal(content.includes("Do not dump this answer."), false);
	assert.equal(content.includes("Do not dump this question?"), false);
	assert.equal(content.includes("Do not dump this rubric."), false);
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
	const content = getFirstDraftContent(result);
	const parsedCards = parseMnemeCards(content);

	assert.equal(result.status, "rendered");
	assert.match(content, /^---\nmneme_type: card_group\nmneme_concept_id: concept-encapsulation\nmneme_version: 1/m);
	assert.match(content, /concept: "\[\[Mneme\/Concepts\/Encapsulation\/Concept\|Encapsulation\]\]"/);
	assert.match(content, /Related Concept: \[\[Mneme\/Concepts\/Encapsulation\/Concept\|Encapsulation\]\]/);
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
	const content = getFirstDraftContent(renderMarkdownProposal(proposal, DEFAULT_SETTINGS));

	assert.equal(content.includes("fsrs"), false);
	assert.equal(content.includes("reviewState"), false);
	assert.equal(content.includes("stability"), false);
	assert.equal(content.includes("difficulty"), false);
	assert.equal(content.includes("dueAt"), false);
	assert.equal(content.includes("retrievability"), false);
	assert.equal(content.includes("proposal-e"), false);
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
		createTemporaryWriterCardId("Concept", "What is x?", "proposal-b"),
	);
}

console.log("Markdown proposal renderer tests passed.");
