import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { ApprovedProposalWriter } from "./approvedProposalWriter";
import { canTransitionProposalStatus } from "./knowledgeProposalLifecycle";
import { hasWriteReceipt, type KnowledgeProposalStore } from "./knowledgeProposalStore";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";
import type { ConceptNameConflict } from "./conceptNameConflict";

export type InboxAcceptanceKind = "concept" | "card";

export interface InboxAcceptanceResult {
	conflict?: ConceptNameConflict;
	errors?: string[];
	kind?: InboxAcceptanceKind;
	message: string;
	status: "accepted" | "failed" | "invalid" | "name_conflict" | "not_found" | "unsupported";
	targetPaths?: string[];
}

export interface InboxAcceptanceOptions {
	nameConflictResolution?: "keep_both";
}

export interface InboxAcceptanceWorkflowOptions {
	proposalStore: KnowledgeProposalStore;
	writer: ApprovedProposalWriter;
}

export class InboxAcceptanceWorkflow {
	constructor(private readonly options: InboxAcceptanceWorkflowOptions) {
	}

	async acceptProposal(
		proposalId: string,
		options: InboxAcceptanceOptions = {},
	): Promise<InboxAcceptanceResult> {
		try {
			return await this.acceptProposalInternal(proposalId, options);
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Proposal acceptance failed.",
				status: "failed",
			};
		}
	}

	private async acceptProposalInternal(
		proposalId: string,
		options: InboxAcceptanceOptions,
	): Promise<InboxAcceptanceResult> {
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

		const pendingWrite = hasWriteReceipt(proposal);
		const validation = pendingWrite
			? { valid: true, errors: [], warnings: [] }
			: validateKnowledgeProposalPayload(proposal);

		if (!validation.valid) {
			return {
				errors: validation.errors,
				kind,
				message: "Fix proposal errors before accepting.",
				status: "invalid",
			};
		}

		if (!pendingWrite && proposal.kind === "new_concept" && options.nameConflictResolution !== "keep_both") {
			try {
				const conflict = await this.options.writer.findNewConceptNameConflict(proposal.id);
				if (conflict) {
					return {
						conflict,
						kind,
						message: "Choose how to resolve the Concept name conflict.",
						status: "name_conflict",
					};
				}
			} catch (error) {
				return {
					kind,
					message: error instanceof Error ? error.message : "Concept conflict lookup failed.",
					status: "failed",
				};
			}
		}

		try {
			const approvedProposal = pendingWrite && (proposal.status === "approved" || proposal.status === "written")
				? proposal
				: await this.ensureApproved(proposal);
			const writeResult = await this.options.writer.writeApprovedProposal(approvedProposal.id);

			if (writeResult.status === "written") {
				return {
					kind,
					message: `${formatKind(kind)} accepted.`,
					status: "accepted",
					targetPaths: writeResult.targetPaths,
				};
			}

			if (!pendingWrite) {
				await this.returnToActionableState(approvedProposal);
			}

			return {
				kind,
				message: writeResult.message,
				status: writeResult.status === "skipped" ? "unsupported" : "failed",
			};
		} catch (error) {
			return {
				kind,
				message: error instanceof Error ? error.message : "Proposal cannot be accepted.",
				status: "failed",
			};
		}
	}

	async rejectProposal(proposalId: string): Promise<InboxAcceptanceResult> {
		try {
			return await this.rejectProposalInternal(proposalId);
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Proposal rejection failed.",
				status: "failed",
			};
		}
	}

	private async rejectProposalInternal(proposalId: string): Promise<InboxAcceptanceResult> {
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

		if (hasWriteReceipt(proposal)) {
			return { message: "A pending Markdown write must be resumed before it can be rejected.", status: "failed" };
		}

		try {
			await this.options.proposalStore.updateProposalStatus(proposal.id, "rejected");
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Proposal rejection failed.",
				status: "failed",
			};
		}

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
		const latest = await this.options.proposalStore.getProposal(proposal.id);
		if (!latest || hasWriteReceipt(latest) || latest.status === "written") return;
		if (canTransitionProposalStatus(latest.status, "stale")) {
			await this.options.proposalStore.updateProposalStatus(latest.id, "stale");
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
