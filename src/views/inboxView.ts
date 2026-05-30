import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import { ProposalDetailModal } from "../modals/proposalDetailModal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import {
	getProposalEvidenceCount,
	getProposalPreview,
	getProposalSourcePath,
	getProposalSubtitle,
	getProposalTitle,
} from "../services/knowledgeProposalDisplay";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import { validateKnowledgeProposalPayload } from "../services/knowledgeProposalValidation";
import { isMarkdownWritableProposalKind } from "../services/markdownProposalRenderer";

export const INBOX_VIEW_TYPE = "mneme-inbox-view";

export class MnemeInboxView extends ItemView {
	private proposals: KnowledgeProposal[] = [];
	private statusMessage = "Loading proposals...";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly proposalStore: KnowledgeProposalStore,
		private readonly proposalWriter?: ApprovedProposalWriter,
	) {
		super(leaf);
	}

	getViewType(): string {
		return INBOX_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Mneme Inbox";
	}

	getIcon(): string {
		return "inbox";
	}

	protected async onOpen(): Promise<void> {
		this.render();
		await this.refresh();
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		try {
			this.proposals = await this.proposalStore.listProposals();
			this.statusMessage = `${this.proposals.length} knowledge proposals loaded.`;
		} catch (error) {
			console.error("Mneme: failed to load Inbox proposals", error);
			this.proposals = [];
			this.statusMessage = "Failed to load Inbox proposals. See console for details.";
		}

		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-inbox-view");
		this.contentEl.addClass("mneme-review-view");

		this.renderHeader();
		this.renderSummary();
		this.renderStatus();
		this.renderProposalList();
	}

	private renderHeader(): void {
		const headerEl = this.contentEl.createDiv({ cls: "mneme-review-header" });
		const titleGroupEl = headerEl.createDiv();

		titleGroupEl.createEl("h2", {
			cls: "mneme-review-title",
			text: "Mneme Inbox",
		});
		titleGroupEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "AI-generated knowledge change proposals waiting for review.",
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });
		toolbarEl.createEl("button", { text: "Refresh" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refresh();
			});
		});
	}

	private renderSummary(): void {
		const summary = summarizeProposals(this.proposals);
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${summary.pending} pending` });
		summaryEl.createEl("span", { text: `${summary.approved} approved` });
		summaryEl.createEl("span", { text: `${summary.rejected} rejected` });
		summaryEl.createEl("span", { text: `${summary.stale} stale` });
		summaryEl.createEl("span", { text: `${summary.written} written` });
	}

	private renderStatus(): void {
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.statusMessage,
		});
	}

	private renderProposalList(): void {
		const listEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });

		if (this.proposals.length === 0) {
			listEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No proposals yet.",
			});
			listEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Analyze Current Note currently indexes source notes only. Future AI Capture will add Concept and Card proposals here.",
			});
			return;
		}

		for (const proposal of sortProposals(this.proposals)) {
			this.renderProposalCard(listEl, proposal);
		}
	}

	private renderProposalCard(parentEl: HTMLElement, proposal: KnowledgeProposal): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-inbox-proposal" });
		const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
		const textEl = mainEl.createDiv();

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title",
			text: getProposalTitle(proposal),
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: getProposalSubtitle(proposal),
		});
		textEl.createEl("p", {
			cls: "mneme-review-status",
			text: getProposalPreview(proposal),
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: formatProposalMeta(proposal),
		});
		const writeIndicator = getWriteIndicator(proposal);

		if (writeIndicator) {
			textEl.createEl("p", {
				cls: "mneme-review-queue-meta",
				text: writeIndicator,
			});
		}

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Open" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.openProposalDetail(proposal));
		});
		this.renderProposalAction(actionsEl, proposal, "Approve", "approved", "Mneme: Proposal approved.");
		this.renderProposalAction(actionsEl, proposal, "Reject", "rejected", "Mneme: Proposal rejected.");
	}

	private openProposalDetail(proposal: KnowledgeProposal): void {
		new ProposalDetailModal(this.app, {
			onChange: () => this.refresh(),
			proposal,
			store: this.proposalStore,
			writer: this.proposalWriter,
		}).open();
	}

	private renderProposalAction(
		parentEl: HTMLElement,
		proposal: KnowledgeProposal,
		label: string,
		status: KnowledgeProposalStatus,
		notice: string,
	): void {
		parentEl.createEl("button", { text: label }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.updateProposalStatus(proposal, status, notice);
			});
		});
	}

	private async updateProposalStatus(
		proposal: KnowledgeProposal,
		status: KnowledgeProposalStatus,
		successNotice: string,
	): Promise<void> {
		try {
			if (status === "approved") {
				const validation = validateKnowledgeProposalPayload(proposal);

				if (!validation.valid) {
					new Notice("Mneme: Open proposal and fix errors before approval.");
					return;
				}
			}

			await this.proposalStore.updateProposalStatus(proposal.id, status);
			new Notice(successNotice);
			await this.refresh();
		} catch (error) {
			console.error("Mneme: failed to update proposal status", {
				error,
				proposalId: proposal.id,
				status,
			});
			new Notice("Mneme: Invalid proposal status transition.");
		}
	}
}

function getWriteIndicator(proposal: KnowledgeProposal): string | undefined {
	if (proposal.status === "written") {
		return "Written";
	}

	if (proposal.status === "approved" && isMarkdownWritableProposalKind(proposal.kind)) {
		return "Ready to write";
	}

	return undefined;
}

function summarizeProposals(proposals: KnowledgeProposal[]): Record<"approved" | "pending" | "rejected" | "stale" | "written", number> {
	return {
		approved: proposals.filter((proposal) => proposal.status === "approved").length,
		pending: proposals.filter((proposal) => isPendingStatus(proposal.status)).length,
		rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
		stale: proposals.filter((proposal) => proposal.status === "stale").length,
		written: proposals.filter((proposal) => proposal.status === "written").length,
	};
}

function isPendingStatus(status: KnowledgeProposalStatus): boolean {
	return status === "suggested"
		|| status === "opened"
		|| status === "edited"
		|| status === "stale";
}

function sortProposals(proposals: KnowledgeProposal[]): KnowledgeProposal[] {
	return [...proposals].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function formatProposalMeta(proposal: KnowledgeProposal): string {
	const sourcePath = getProposalSourcePath(proposal);
	const evidenceCount = getProposalEvidenceCount(proposal);
	const parts = [
		sourcePath ? `Source: ${sourcePath}` : undefined,
		proposal.conceptId ? `Concept: ${proposal.conceptId}` : undefined,
		proposal.cardId ? `Card: ${proposal.cardId}` : undefined,
		evidenceCount > 0 ? `${evidenceCount} evidence ${evidenceCount === 1 ? "item" : "items"}` : undefined,
		`Created: ${proposal.createdAt}`,
		`Updated: ${proposal.updatedAt}`,
	];

	return parts.filter((part): part is string => Boolean(part)).join(" · ");
}
