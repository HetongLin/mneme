import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";

const VALID_STATUS_TRANSITIONS: Record<KnowledgeProposalStatus, KnowledgeProposalStatus[]> = {
	approved: ["written", "stale"],
	edited: ["approved", "rejected", "stale"],
	merged: ["written", "stale"],
	opened: ["edited", "approved", "rejected", "stale"],
	rejected: [],
	stale: ["opened", "edited", "approved", "rejected"],
	suggested: ["opened", "edited", "approved", "rejected", "stale"],
	written: [],
};

export function canTransitionProposalStatus(
	from: KnowledgeProposalStatus,
	to: KnowledgeProposalStatus,
): boolean {
	return VALID_STATUS_TRANSITIONS[from].includes(to);
}

export function applyProposalStatus(
	proposal: KnowledgeProposal,
	to: KnowledgeProposalStatus,
	now: string,
): KnowledgeProposal {
	if (!canTransitionProposalStatus(proposal.status, to)) {
		throw new Error(`Invalid proposal status transition: ${proposal.status} -> ${to}`);
	}

	return {
		...proposal,
		status: to,
		updatedAt: now,
	} as KnowledgeProposal;
}
