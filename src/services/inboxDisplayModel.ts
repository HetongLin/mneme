import type { KnowledgeProposal } from "../models/knowledgeProposal";
import { filterActiveInboxProposals } from "./inboxProposalFilters";
import { isCardStageProposal, isConceptStageProposal } from "./knowledgeProposalStage";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";

export interface InboxProductSummary {
	toReview: number;
	conceptProposals: number;
	cardProposals: number;
	invalid: number;
}

export interface InboxEmptyState {
	title: string;
	description: string;
}

export function buildInboxProductSummary(proposals: KnowledgeProposal[]): InboxProductSummary {
	const activeProposals = filterActiveInboxProposals(proposals);

	return {
		cardProposals: activeProposals.filter(isCardStageProposal).length,
		conceptProposals: activeProposals.filter(isConceptStageProposal).length,
		invalid: activeProposals.filter((proposal) => !validateKnowledgeProposalPayload(proposal).valid).length,
		toReview: activeProposals.length,
	};
}

export function getInboxEmptyState(): InboxEmptyState {
	return {
		description: "Concepts and cards you choose to capture will appear here for review.",
		title: "No active proposals.",
	};
}

export function getProposalReadinessLabel(proposal: KnowledgeProposal): "Ready to accept" | "Needs edits" {
	return validateKnowledgeProposalPayload(proposal).valid ? "Ready to accept" : "Needs edits";
}
