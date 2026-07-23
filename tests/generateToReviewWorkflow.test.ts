import assert from "node:assert/strict";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import {
	getGenerateToReviewProposals,
	resolveGenerateToReviewSession,
	shouldRunInboxReconciliation,
	type GenerateToReviewSession,
} from "../src/services/generateToReviewWorkflow";
import { createProposal } from "./knowledgeProposalTestUtils";

const session: GenerateToReviewSession = {
	conceptId: "concept-spacing-effect",
	conceptTitle: "Spacing Effect",
	proposalIds: ["card-a", "card-b"],
};

function card(id: string, status: KnowledgeProposal["status"] = "suggested"): KnowledgeProposal {
	return createProposal(id, {
		kind: "new_card",
		payload: {
			card: { back: `${id} back`, front: `${id} front` },
			conceptId: session.conceptId,
		},
		status,
	});
}

{
	const unrelated = card("unrelated");
	const proposals = [card("card-a"), unrelated, card("card-b")];

	assert.deepEqual(
		getGenerateToReviewProposals(proposals, session).map((proposal) => proposal.id),
		["card-a", "card-b"],
	);
}

{
	assert.deepEqual(resolveGenerateToReviewSession([
		card("card-a", "written"),
		card("card-b", "suggested"),
	], session), { status: "pending" });
}

{
	assert.deepEqual(resolveGenerateToReviewSession([
		card("card-a", "written"),
		card("card-b", "rejected"),
	], session), { acceptedCount: 1, status: "ready_to_review" });
}

{
	assert.deepEqual(resolveGenerateToReviewSession([
		card("card-a", "rejected"),
		card("card-b", "rejected"),
	], session), { status: "all_rejected" });
}

{
	assert.deepEqual(resolveGenerateToReviewSession([
		card("card-a", "written"),
	], session), { status: "pending" });
}

{
	assert.equal(shouldRunInboxReconciliation(session), false);
	assert.equal(shouldRunInboxReconciliation(undefined), true);
}

console.log("Generate to Review workflow tests passed.");
