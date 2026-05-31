import assert from "node:assert/strict";
import {
	filterActiveInboxProposals,
	isActiveInboxProposal,
} from "../src/services/inboxProposalFilters";
import { createProposal } from "./knowledgeProposalTestUtils";

{
	const suggested = createProposal("suggested", { status: "suggested" });
	const opened = createProposal("opened", { status: "opened" });
	const edited = createProposal("edited", { status: "edited" });
	const stale = createProposal("stale", { status: "stale" });
	const approved = createProposal("approved", { status: "approved" });
	const rejected = createProposal("rejected", { status: "rejected" });
	const written = createProposal("written", { status: "written" });
	const proposals = [suggested, opened, edited, stale, approved, rejected, written];

	assert.equal(isActiveInboxProposal(suggested), true);
	assert.equal(isActiveInboxProposal(opened), true);
	assert.equal(isActiveInboxProposal(edited), true);
	assert.equal(isActiveInboxProposal(stale), true);
	assert.equal(isActiveInboxProposal(approved), false);
	assert.equal(isActiveInboxProposal(rejected), false);
	assert.equal(isActiveInboxProposal(written), false);

	assert.deepEqual(filterActiveInboxProposals(proposals).map((proposal) => proposal.id), [
		"suggested",
		"opened",
		"edited",
		"stale",
	]);
}

console.log("Inbox proposal filter tests passed.");
