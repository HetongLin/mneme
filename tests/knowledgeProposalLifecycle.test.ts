import assert from "node:assert/strict";
import { applyProposalStatus, canTransitionProposalStatus } from "../src/services/knowledgeProposalLifecycle";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	assert.equal(canTransitionProposalStatus("suggested", "opened"), true);
	assert.equal(canTransitionProposalStatus("opened", "approved"), true);
	assert.equal(canTransitionProposalStatus("edited", "approved"), true);
	assert.equal(canTransitionProposalStatus("approved", "written"), true);
	assert.equal(canTransitionProposalStatus("rejected", "approved"), false);
	assert.equal(canTransitionProposalStatus("written", "opened"), false);
	assert.equal(canTransitionProposalStatus("stale", "opened"), true);
	assert.equal(canTransitionProposalStatus("stale", "approved"), true);
	assert.equal(canTransitionProposalStatus("suggested", "rejected"), true);
	assert.equal(canTransitionProposalStatus("opened", "rejected"), true);
	assert.equal(canTransitionProposalStatus("edited", "rejected"), true);
	assert.equal(canTransitionProposalStatus("stale", "rejected"), true);
}

{
	const proposal = createProposal("proposal-a", {
		status: "opened",
		updatedAt: "2026-01-01T12:00:00.000Z",
	});
	const updatedProposal = applyProposalStatus(proposal, "approved", "2026-01-02T12:00:00.000Z");

	assert.equal(updatedProposal.status, "approved");
	assert.equal(updatedProposal.updatedAt, "2026-01-02T12:00:00.000Z");
	assert.equal(proposal.status, "opened");
	assert.equal(proposal.updatedAt, "2026-01-01T12:00:00.000Z");
	assert.equal(updatedProposal.id, proposal.id);
	assert.equal(updatedProposal.kind, proposal.kind);
}

{
	const proposal = createProposal("proposal-b", {
		status: "written",
	});

	assert.throws(
		() => applyProposalStatus(proposal, "opened", "2026-01-02T12:00:00.000Z"),
		/Invalid proposal status transition/,
	);
}

console.log("Knowledge proposal lifecycle tests passed.");
