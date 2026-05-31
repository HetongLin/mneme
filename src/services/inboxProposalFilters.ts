import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";

const ACTIVE_STATUSES = new Set<KnowledgeProposalStatus>([
	"suggested",
	"opened",
	"edited",
	"stale",
]);

const HISTORY_STATUSES = new Set<KnowledgeProposalStatus>([
	"rejected",
	"written",
]);

export function isActiveInboxProposal(proposal: KnowledgeProposal): boolean {
	return ACTIVE_STATUSES.has(proposal.status);
}

export function isInboxHistoryProposal(proposal: KnowledgeProposal): boolean {
	return HISTORY_STATUSES.has(proposal.status);
}

export function filterActiveInboxProposals(proposals: KnowledgeProposal[]): KnowledgeProposal[] {
	return proposals.filter(isActiveInboxProposal);
}

export function filterInboxHistoryProposals(proposals: KnowledgeProposal[]): KnowledgeProposal[] {
	return proposals.filter(isInboxHistoryProposal);
}
