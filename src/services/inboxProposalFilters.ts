import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";

const ACTIVE_STATUSES = new Set<KnowledgeProposalStatus>([
	"suggested",
	"opened",
	"edited",
	"stale",
]);

export function isActiveInboxProposal(proposal: KnowledgeProposal): boolean {
	return ACTIVE_STATUSES.has(proposal.status);
}

export function filterActiveInboxProposals(proposals: KnowledgeProposal[]): KnowledgeProposal[] {
	return proposals.filter(isActiveInboxProposal);
}
