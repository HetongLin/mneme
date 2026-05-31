import assert from "node:assert/strict";
import { createProposal } from "./knowledgeProposalTestUtils";
import {
	getProposalStageLabel,
	isCardStageProposal,
	isConceptStageProposal,
} from "../src/services/knowledgeProposalStage";

{
	const proposal = createProposal("concept", { kind: "new_concept" });

	assert.equal(isConceptStageProposal(proposal), true);
	assert.equal(isCardStageProposal(proposal), false);
	assert.equal(getProposalStageLabel(proposal), "Concept stage");
}

{
	const proposal = createProposal("card", {
		kind: "new_card",
		payload: {
			card: {
				back: "Back",
				front: "Front",
			},
			conceptId: "concept-a",
		},
	});

	assert.equal(isConceptStageProposal(proposal), false);
	assert.equal(isCardStageProposal(proposal), true);
	assert.equal(getProposalStageLabel(proposal), "Card stage");
}

console.log("Knowledge proposal stage tests passed.");
