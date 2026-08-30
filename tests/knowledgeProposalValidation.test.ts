import assert from "node:assert/strict";
import { validateKnowledgeProposalPayload } from "../src/services/knowledgeProposalValidation";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	const proposal = createProposal("proposal-a", {
		kind: "new_concept",
		payload: {
			title: "Encapsulation",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, true);
}

{
	const proposal = createProposal("proposal-b", {
		kind: "new_concept",
		payload: {
			title: "",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-legacy-concept", {
		kind: "new_concept",
		payload: {
			summary: "Legacy field",
			title: "Encapsulation",
		} as never,
	});

	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("summary is not supported; regenerate this proposal with whyItMatters."), true);
}

{
	const proposal = createProposal("proposal-c", {
		kind: "new_card",
		payload: {
			card: {
				back: "Answer",
				front: "Question",
			},
			conceptId: "concept-a",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, true);
}

{
	const proposal = createProposal("proposal-d", {
		kind: "new_card",
		payload: {
			card: {
				back: "",
				front: "",
			},
			conceptId: "concept-a",
		},
	});

	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.equal(result.errors.length >= 2, true);
}

{
	const proposal = createProposal("proposal-missing-concept-id", {
		kind: "new_card",
		payload: {
			card: {
				back: "Answer",
				front: "Question",
			},
		} as never,
	});
	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("New card Concept id is required."), true);
}

{
	const proposal = createProposal("proposal-e", {
		kind: "revise_card",
		payload: {
			cardId: "",
			revisedCard: {
				back: "Answer",
				front: "Question",
			},
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-f", {
		kind: "retire_card",
		payload: {
			cardId: "",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-g", {
		kind: "merge_card",
		payload: {
			mergedCard: {
				back: "Answer",
				front: "Question",
			},
			sourceCardIds: ["one-card"],
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-h", {
		kind: "split_card",
		payload: {
			replacementCards: [{
				back: "Answer",
				front: "Question",
			}],
			sourceCardId: "source-card",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-i", {
		kind: "link_existing_concept",
		payload: {
			proposedSourceLink: {
				relationType: "supporting",
				sourcePath: "Notes/Intro.md",
			},
			targetConceptId: "concept-a",
		},
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, true);
}

{
	const proposal = createProposal("proposal-empty-update", {
		kind: "update_concept",
		payload: {
			conceptId: "concept-a",
		},
	});

	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.deepEqual(result.errors, ["Concept update must include at least one proposed change."]);
}

{
	const proposal = createProposal("proposal-legacy-update", {
		kind: "update_concept",
		payload: {
			conceptId: "concept-a",
			proposedSummary: "Legacy field",
		} as never,
	});

	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("proposedSummary is not supported; regenerate this proposal with proposedWhyItMatters."), true);
}

{
	const proposal = createProposal("proposal-invalid-update-view", {
		kind: "update_concept",
		payload: {
			conceptId: "concept-a",
			proposedViews: [{ body: "", title: "" }],
		},
	});

	const result = validateKnowledgeProposalPayload(proposal);

	assert.equal(result.valid, false);
	assert.deepEqual(result.errors, [
		"Concept view title is required.",
		"Concept view body is required.",
	]);
}

{
	const proposal = createProposal("proposal-j", {
		kind: "new_concept",
		payload: undefined,
	});

	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-k", {
		kind: "new_concept",
		payload: 7 as never,
	});

	assert.doesNotThrow(() => validateKnowledgeProposalPayload(proposal));
	assert.equal(validateKnowledgeProposalPayload(proposal).valid, false);
}

{
	const proposal = createProposal("proposal-l", {
		kind: "new_concept",
		payload: {
			title: "",
		},
	});
	const originalPayload = proposal.payload;

	validateKnowledgeProposalPayload(proposal);

	assert.equal(proposal.payload, originalPayload);
}

console.log("Knowledge proposal validation tests passed.");
