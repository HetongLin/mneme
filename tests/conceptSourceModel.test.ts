import assert from "node:assert/strict";
import {
	ConceptSourceLink,
	getApprovedConceptSourceLinks,
} from "../src/models/conceptSource";
import {
	KNOWLEDGE_PROPOSAL_KINDS,
	KNOWLEDGE_PROPOSAL_STATUSES,
	KnowledgeProposal,
} from "../src/models/knowledgeProposal";

{
	const links = [
		createLink("link-1", "concept-a", "Notes/Intro.md"),
		createLink("link-2", "concept-b", "Notes/Intro.md"),
	];
	const conceptIds = new Set(links.map((link) => link.conceptId));

	assert.equal(conceptIds.size, 2);
}

{
	const links = [
		createLink("link-1", "concept-a", "Notes/Intro.md"),
		createLink("link-2", "concept-a", "Notes/Advanced.md"),
	];
	const sourcePaths = new Set(links.map((link) => link.sourcePath));

	assert.equal(sourcePaths.size, 2);
}

{
	const link = createLink("link-1", "concept-a", "Notes/Intro.md", {
		evidence: [{
			excerpt: "Encapsulation hides representation details.",
			heading: "Design",
			lineEnd: 12,
			lineStart: 10,
		}],
		relationType: "supporting",
	});

	assert.equal(link.relationType, "supporting");
	assert.equal(link.evidence[0]?.heading, "Design");
	assert.equal(link.evidence[0]?.lineStart, 10);
}

{
	const approved = createLink("approved", "concept-a", "Notes/Intro.md", {
		status: "approved",
	});
	const suggested = createLink("suggested", "concept-a", "Notes/Intro.md", {
		status: "suggested",
	});

	assert.deepEqual(getApprovedConceptSourceLinks([approved, suggested]), [approved]);
}

{
	assert.deepEqual(KNOWLEDGE_PROPOSAL_KINDS, [
		"new_concept",
		"link_existing_concept",
		"merge_concept",
		"add_view",
		"update_concept",
		"new_card",
		"revise_card",
		"split_card",
		"merge_card",
		"retire_card",
	]);
	assert.deepEqual(KNOWLEDGE_PROPOSAL_STATUSES, [
		"suggested",
		"opened",
		"edited",
		"approved",
		"rejected",
		"merged",
		"written",
		"stale",
	]);
}

{
	const proposal: KnowledgeProposal = {
		createdAt: "2026-01-01T12:00:00.000Z",
		evidence: [{
			excerpt: "Polymorphism uses the same interface for different implementations.",
		}],
		id: "proposal-1",
		kind: "link_existing_concept",
		sourceHash: "abc123",
		sourcePath: "Notes/OOP.md",
		status: "suggested",
		updatedAt: "2026-01-01T12:00:00.000Z",
	};

	assert.equal(proposal.sourcePath, "Notes/OOP.md");
	assert.equal(proposal.sourceHash, "abc123");
	assert.equal(proposal.status, "suggested");
}

function createLink(
	id: string,
	conceptId: string,
	sourcePath: string,
	overrides: Partial<ConceptSourceLink> = {},
): ConceptSourceLink {
	return {
		addedAt: "2026-01-01T12:00:00.000Z",
		conceptId,
		evidence: [{
			excerpt: "Evidence excerpt.",
		}],
		id,
		lastSeenAt: "2026-01-01T12:00:00.000Z",
		relationType: "origin",
		sourceHash: "abc123",
		sourcePath,
		status: "approved",
		...overrides,
	};
}
