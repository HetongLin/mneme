import type { KnowledgeProposal } from "../models/knowledgeProposal";

export interface GenerateToReviewSession {
	conceptId: string;
	conceptTitle: string;
	proposalIds: string[];
}

export type GenerateToReviewResolution =
	| { status: "pending" }
	| { acceptedCount: number; status: "ready_to_review" }
	| { status: "all_rejected" };

export function getGenerateToReviewProposals(
	proposals: KnowledgeProposal[],
	session: GenerateToReviewSession,
): KnowledgeProposal[] {
	const proposalIds = new Set(session.proposalIds);

	return proposals.filter((proposal) => proposalIds.has(proposal.id));
}

/**
 * Terminal proposal records are the scoped workflow's completion ledger. The
 * ordinary Inbox reconciler removes written/rejected proposals, so it must wait
 * until the Generate-to-Review session has resolved and released its scope.
 */
export function shouldRunInboxReconciliation(
	session: GenerateToReviewSession | undefined,
): boolean {
	return session === undefined;
}

export function resolveGenerateToReviewSession(
	proposals: KnowledgeProposal[],
	session: GenerateToReviewSession,
): GenerateToReviewResolution {
	const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
	const batch = session.proposalIds.map((proposalId) => proposalsById.get(proposalId));

	if (
		batch.length === 0
		|| batch.some((proposal) => !proposal)
		|| batch.some((proposal) => proposal?.status !== "written" && proposal?.status !== "rejected")
	) {
		return { status: "pending" };
	}

	const acceptedCount = batch.filter((proposal) => proposal?.status === "written").length;

	return acceptedCount > 0
		? { acceptedCount, status: "ready_to_review" }
		: { status: "all_rejected" };
}
