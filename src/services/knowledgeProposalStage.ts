import type { KnowledgeProposal } from "../models/knowledgeProposal";

const CONCEPT_STAGE_KINDS = new Set<KnowledgeProposal["kind"]>([
	"new_concept",
	"link_existing_concept",
	"merge_concept",
	"add_view",
	"update_concept",
]);

const CARD_STAGE_KINDS = new Set<KnowledgeProposal["kind"]>([
	"new_card",
	"revise_card",
	"split_card",
	"merge_card",
	"retire_card",
]);

export function isConceptStageProposal(proposal: KnowledgeProposal): boolean {
	return CONCEPT_STAGE_KINDS.has(proposal.kind);
}

export function isCardStageProposal(proposal: KnowledgeProposal): boolean {
	return CARD_STAGE_KINDS.has(proposal.kind);
}

export function getProposalStageLabel(proposal: KnowledgeProposal): "Concept stage" | "Card stage" | "Other stage" {
	if (isConceptStageProposal(proposal)) {
		return "Concept stage";
	}

	if (isCardStageProposal(proposal)) {
		return "Card stage";
	}

	return "Other stage";
}
