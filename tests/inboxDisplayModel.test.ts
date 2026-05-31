import assert from "node:assert/strict";
import {
	buildInboxProductSummary,
	getInboxEmptyState,
	getProposalReadinessLabel,
} from "../src/services/inboxDisplayModel";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	const conceptProposal = createProposal("concept-a", {
		kind: "new_concept",
		payload: { title: "Encapsulation" },
	});
	const cardProposal = createProposal("card-a", {
		kind: "new_card",
		payload: {
			card: {
				back: "It hides implementation details.",
				front: "What does encapsulation hide?",
			},
			conceptId: "concept-encapsulation",
		},
	});
	const invalidProposal = createProposal("invalid-a", {
		kind: "new_card",
		payload: {
			card: {
				back: "",
				front: "",
			},
			conceptId: "concept-encapsulation",
		},
	});
	const writtenProposal = createProposal("written-a", {
		payload: { title: "Already Written" },
		status: "written",
	});
	const rejectedProposal = createProposal("rejected-a", {
		payload: { title: "Rejected" },
		status: "rejected",
	});

	assert.deepEqual(buildInboxProductSummary([
		conceptProposal,
		cardProposal,
		invalidProposal,
		writtenProposal,
		rejectedProposal,
	]), {
		cardProposals: 2,
		conceptProposals: 1,
		invalid: 1,
		toReview: 3,
	});
}

{
	const emptyState = getInboxEmptyState();

	assert.equal(emptyState.title, "No active proposals.");
	assert.equal(emptyState.description, "Concepts and cards you choose to capture will appear here for review.");
	assert.equal(emptyState.description.includes("approved"), false);
	assert.equal(emptyState.description.includes("rejected"), false);
	assert.equal(emptyState.description.includes("written"), false);
}

{
	assert.equal(getProposalReadinessLabel(createProposal("valid", {
		payload: { title: "Valid Concept" },
	})), "Ready to accept");
	assert.equal(getProposalReadinessLabel(createProposal("invalid", {
		payload: {},
	})), "Needs edits");
}

console.log("Inbox display model tests passed.");
