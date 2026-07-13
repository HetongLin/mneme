import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { ApprovedProposalWriter } from "./approvedProposalWriter";
import { canTransitionProposalStatus } from "./knowledgeProposalLifecycle";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";

export type InboxAcceptanceKind = "concept" | "card";

export interface InboxAcceptanceResult {
	errors?: string[];
	kind?: InboxAcceptanceKind;
	message: string;
	status: "accepted" | "failed" | "invalid" | "not_found" | "unsupported";
	targetPaths?: string[];
}

export interface InboxAcceptanceWorkflowOptions {
	proposalStore: KnowledgeProposalStore;
	writer: ApprovedProposalWriter;
}

export class InboxAcceptanceWorkflow {
	constructor(private readonly options: InboxAcceptanceWorkflowOptions) {
	}

	async acceptProposal(proposalId: string): Promise<InboxAcceptanceResult> {
		const proposal = await this.options.proposalStore.getProposal(proposalId);

		if (!proposal) {
			return {
				message: `Proposal not found: ${proposalId}`,
				status: "not_found",
			};
		}

		const kind = getAcceptanceKind(proposal);

		if (!kind) {
			return {
				message: "This proposal type cannot be accepted yet.",
				status: "unsupported",
			};
		}

		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid) {
			return {
				errors: validation.errors,
				kind,
				message: "Fix proposal errors before accepting.",
				status: "invalid",
			};
		}

		let approvedProposal: KnowledgeProposal;

		try {
			approvedProposal = await this.ensureApproved(proposal);
		} catch (error) {
			return {
				kind,
				message: error instanceof Error ? error.message : "Proposal cannot be accepted.",
				status: "failed",
			};
		}

		const writeResult = await this.options.writer.writeApprovedProposal(approvedProposal.id);

		if (writeResult.status === "written") {
			return {
				kind,
				message: `${formatKind(kind)} accepted.`,
				status: "accepted",
				targetPaths: writeResult.targetPaths,
			};
		}

		await this.returnToActionableState(approvedProposal);

		return {
			kind,
			message: writeResult.message,
			status: writeResult.status === "skipped" ? "unsupported" : "failed",
		};
	}

	async rejectProposal(proposalId: string): Promise<InboxAcceptanceResult> {
		const proposal = await this.options.proposalStore.getProposal(proposalId);

		if (!proposal) {
			return {
				message: `Proposal not found: ${proposalId}`,
				status: "not_found",
			};
		}

		if (proposal.status === "rejected") {
			return {
				message: "Proposal already rejected.",
				status: "accepted",
			};
		}

		if (!canTransitionProposalStatus(proposal.status, "rejected")) {
			return {
				message: `Cannot reject proposal with status ${proposal.status}.`,
				status: "failed",
			};
		}

		await this.options.proposalStore.updateProposalStatus(proposal.id, "rejected");

		return {
			message: "Proposal rejected.",
			status: "accepted",
		};
	}

	private async ensureApproved(proposal: KnowledgeProposal): Promise<KnowledgeProposal> {
		if (proposal.status === "approved") {
			return proposal;
		}

		if (!canTransitionProposalStatus(proposal.status, "approved")) {
			throw new Error(`Cannot accept proposal with status ${proposal.status}.`);
		}

		return this.options.proposalStore.updateProposalStatus(proposal.id, "approved");
	}

	private async returnToActionableState(proposal: KnowledgeProposal): Promise<void> {
		if (canTransitionProposalStatus(proposal.status, "stale")) {
			await this.options.proposalStore.updateProposalStatus(proposal.id, "stale");
		}
	}
}

export function getAcceptanceKind(proposal: KnowledgeProposal): InboxAcceptanceKind | undefined {
	if (
		proposal.kind === "new_concept"
		|| proposal.kind === "link_existing_concept"
		|| proposal.kind === "update_concept"
	) {
		return "concept";
	}

	if (proposal.kind === "add_view") {
		return "concept";
	}

	if (proposal.kind === "new_card") {
		return "card";
	}

	return undefined;
}

export function formatAcceptActionLabel(proposal: KnowledgeProposal): string {
	return getAcceptanceKind(proposal) ? "Accept & Next" : "Accept";
}

function formatKind(kind: InboxAcceptanceKind): string {
	return kind === "concept" ? "Concept" : "Card";
}
