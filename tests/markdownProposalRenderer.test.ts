import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { renderMarkdownProposal } from "../src/services/markdownProposalRenderer";
import { createProposal } from "./knowledgeProposalTestUtils";

const FIXED_IDS = {
	createCardId: () => "card-gjsl5r2n",
	createConceptId: () => "concept-k7m3p9qx",
};
const ALIAS_SETTINGS = { ...DEFAULT_SETTINGS, suggestEnglishAliases: true };

function render(proposal: Parameters<typeof renderMarkdownProposal>[0]) {
	return renderMarkdownProposal(proposal, ALIAS_SETTINGS, FIXED_IDS);
}

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
			tags: ["Object Oriented Programming", "#design"],
			title: "Encapsulation",
		},
		status: "approved",
	});
	const result = render(proposal);
	const content = getFirstDraftContent(result);

	assert.equal(result.status, "rendered");
	assert.equal(result.status === "rendered" ? result.drafts[0].targetPath : "", "Mneme/Concepts/Encapsulation.md");
	assert.match(content, /^---\nmneme_type: concept\nmneme_id: concept-k7m3p9qx\nmneme_title: "Encapsulation"\nmneme_version: 1/m);
	assert.equal(content.includes("mneme_english_name"), false);
	assert.match(content, /cards: "\[\[Mneme\/Cards\/Encapsulation\/Cards\|Encapsulation Cards\]\]"/);
	assert.match(content, /learning_mode: reviewable/);
	assert.match(content, /importance: normal/);
	assert.match(content, /tags: \[object-oriented-programming, design\]/);
	assert.match(content, /# Encapsulation/);
	assert.match(content, /## Core Meaning\n\nEncapsulation protects/);
	assert.match(content, /## Review Cards\n\nCards: \[\[Mneme\/Cards\/Encapsulation\/Cards\|Encapsulation Cards\]\]/);
	assert.equal(content.includes("Add why this concept matters here."), false);
	assert.equal(content.includes("Add views here."), false);
	assert.equal(content.includes("Add common traps here."), false);
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
	const content = getFirstDraftContent(render(proposal));

	assert.match(content, /> \[!info\]- Source Notes/);
	assert.match(content, /> - \[\[Software Construction\/Chapter 7\]\]/);
	assert.match(content, />   - relation: origin/);
	assert.match(content, />   - evidence: Objects hide their representation behind methods\./);
}

{
	const proposal = createProposal("proposal-c", {
		ai: {
			confidence: 0.99,
			normalizedAt: "2026-01-01T12:00:00.000Z",
			rationale: "internal rationale should not render",
			schemaVersion: "mneme.ai.proposals.v1",
			warnings: ["internal warning"],
		},
		evidence: [{
			excerpt: "{\"quote\":\"raw evidence JSON should not render\"}",
		}],
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
	const content = getFirstDraftContent(render(proposal));

	assert.equal(content.includes("source-hash-that-should-not-render"), false);
	assert.equal(content.includes("proposal-c"), false);
	assert.equal(content.includes("schemaVersion"), false);
	assert.equal(content.includes("mneme.ai.proposals.v1"), false);
	assert.equal(content.includes("confidence"), false);
	assert.equal(content.includes("0.99"), false);
	assert.equal(content.includes("provider"), false);
	assert.equal(content.includes("model"), false);
	assert.equal(content.includes("prompt"), false);
	assert.equal(content.includes("diagnostics"), false);
	assert.equal(content.includes("raw evidence JSON"), false);
	assert.equal(content.includes("internal rationale"), false);
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
				cardType: "definition",
				front: "What is encapsulation?",
				rubric: "Mention bundling and hidden representation.",
			},
			conceptId: "concept-encapsulation",
			conceptTitle: "Encapsulation",
		},
		status: "approved",
	});
	const result = render(proposal);
	const content = getFirstDraftContent(result);
	const parsedCards = parseMnemeCards(content);

	assert.equal(result.status, "rendered");
	assert.equal(result.status === "rendered" ? result.drafts[0].targetPath : "", "Mneme/Cards/Encapsulation/Cards.md");
	assert.equal(result.status === "rendered" ? result.drafts[0].mode : "", "upsert_card_group");
	assert.match(content, /^---\nmneme_type: card_group\nmneme_concept_id: concept-encapsulation/m);
	assert.match(content, /mneme_concept_id: concept-encapsulation/);
	assert.match(content, /concept: "\[\[Mneme\/Concepts\/Encapsulation\|Encapsulation\]\]"/);
	assert.match(content, /MNEME:CARD:start id="card-gjsl5r2n" type="definition"/);
	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0].isValid, true);
	assert.equal(parsedCards[0].hasExplicitCardId, true);
	assert.equal(parsedCards[0].front, "What is encapsulation?");
}

{
	const proposal = createProposal("proposal-unicode-tags", {
		kind: "new_concept",
		payload: {
			coreMeaning: "向量空间是满足线性组合封闭性的集合。",
			englishName: "Vector Space",
			tags: ["线性代数", "Linear Algebra"],
			title: "向量空间",
		},
		status: "approved",
	});
	const content = getFirstDraftContent(render(proposal));

	assert.match(content, /tags: \[线性代数, linear-algebra\]/);
	assert.match(content, /mneme_id: concept-k7m3p9qx/);
	assert.match(content, /mneme_title: "向量空间"/);
	assert.match(content, /mneme_english_name: "Vector Space"/);
	assert.match(content, /# 向量空间 \(Vector Space\)/);
}

{
	const proposal = createProposal("proposal-alias-disabled", {
		kind: "new_concept",
		payload: {
			englishName: "Vector Space",
			title: "向量空间",
		},
		status: "approved",
	});
	const result = renderMarkdownProposal(proposal, DEFAULT_SETTINGS, FIXED_IDS);
	const content = getFirstDraftContent(result);

	assert.equal(content.includes("mneme_english_name"), false);
	assert.match(content, /^# 向量空间$/m);
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
	const content = getFirstDraftContent(render(proposal));

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
			proposedWhyItMatters: "The update explains why the Concept matters.",
		},
		status: "approved",
	});
	const result = render(proposal);

	assert.equal(result.status, "unsupported");
}

console.log("Markdown proposal renderer tests passed.");
