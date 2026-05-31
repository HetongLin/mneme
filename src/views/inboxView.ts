import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import { ProposalDetailModal } from "../modals/proposalDetailModal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import {
	filterActiveInboxProposals,
} from "../services/inboxProposalFilters";
import {
	formatAcceptActionLabel,
	getAcceptanceKind,
	InboxAcceptanceWorkflow,
} from "../services/inboxAcceptanceWorkflow";
import {
	getProposalEvidenceCount,
	getProposalPreview,
	getProposalSourcePath,
	getProposalSubtitle,
	getProposalTargetLabel,
	getProposalTitle,
} from "../services/knowledgeProposalDisplay";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import {
	getProposalStageLabel,
	isCardStageProposal,
	isConceptStageProposal,
} from "../services/knowledgeProposalStage";
import { validateKnowledgeProposalPayload } from "../services/knowledgeProposalValidation";
import type { VaultStateReconciler } from "../services/vaultStateReconciler";

export const INBOX_VIEW_TYPE = "mneme-inbox-view";

export class MnemeInboxView extends ItemView {
	private proposals: KnowledgeProposal[] = [];
	private statusMessage = "Loading proposals...";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly proposalStore: KnowledgeProposalStore,
		private readonly proposalWriter?: ApprovedProposalWriter,
		private readonly vaultStateReconciler?: VaultStateReconciler,
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

	async refresh(options: { showNotice?: boolean } = {}): Promise<void> {
		try {
			const reconciliationResult = await this.vaultStateReconciler?.reconcile();
			this.proposals = await this.proposalStore.listProposals();
			const activeCount = filterActiveInboxProposals(this.proposals).length;
			const removedCount = countRemovedItems(reconciliationResult);

			this.statusMessage = removedCount > 0
				? `${activeCount} active proposals loaded. Removed ${removedCount} stale items.`
				: `${activeCount} active proposals loaded.`;

			if (options.showNotice) {
				new Notice(removedCount > 0
					? `Mneme: Inbox refreshed. Removed ${removedCount} stale proposals.`
					: "Mneme: Inbox refreshed.");
			}
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
				void this.refresh({ showNotice: true });
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

		const activeProposals = filterActiveInboxProposals(this.proposals);

		if (activeProposals.length === 0) {
			listEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No active proposals.",
			});
			listEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Analyze Current Note currently indexes source notes only. Future AI Capture will add Concept and Card proposals here.",
			});
			return;
		}

		this.renderProposalSection(
			listEl,
			"Concept Proposals",
			sortProposals(activeProposals.filter(isConceptStageProposal)),
		);
		this.renderProposalSection(
			listEl,
			"Card Proposals",
			sortProposals(activeProposals.filter(isCardStageProposal)),
		);
		this.renderProposalSection(
			listEl,
			"Unsupported/Other Proposals",
			sortProposals(activeProposals.filter((proposal) => {
				return !isConceptStageProposal(proposal) && !isCardStageProposal(proposal);
			})),
		);
	}

	private renderProposalSection(parentEl: HTMLElement, title: string, proposals: KnowledgeProposal[]): void {
		if (proposals.length === 0) {
			return;
		}

		parentEl.createEl("h3", {
			cls: "mneme-inbox-section-title",
			text: title,
		});

		for (const proposal of proposals) {
			this.renderProposalCard(parentEl, proposal);
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
			text: `${getProposalStageLabel(proposal)} · ${getProposalSubtitle(proposal)}`,
		});
		textEl.createEl("p", {
			cls: "mneme-review-status",
			text: getProposalPreview(proposal),
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: formatProposalMeta(proposal),
		});
		textEl.createEl("p", {
			cls: getValidationSummary(proposal).startsWith("Needs") ? "mneme-review-error" : "mneme-review-queue-meta",
			text: getValidationSummary(proposal),
		});
		const sourceLinkIndicator = getSourceLinkIndicator(proposal);

		if (sourceLinkIndicator) {
			textEl.createEl("p", {
				cls: "mneme-review-queue-meta",
				text: sourceLinkIndicator,
			});
		}

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Open" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.openProposalDetail(proposal));
		});
		if (filterActiveInboxProposals([proposal]).length > 0) {
			this.renderAcceptAction(actionsEl, proposal);
			this.renderRejectAction(actionsEl, proposal);
		}
	}

	private openProposalDetail(proposal: KnowledgeProposal): void {
		new ProposalDetailModal(this.app, {
			onChange: () => this.refresh(),
			proposal,
			store: this.proposalStore,
			writer: this.proposalWriter,
		}).open();
	}

	private renderAcceptAction(parentEl: HTMLElement, proposal: KnowledgeProposal): void {
		if (!getAcceptanceKind(proposal)) {
			return;
		}

		parentEl.createEl("button", { text: formatAcceptActionLabel(proposal) }, (buttonEl) => {
			buttonEl.disabled = !this.proposalWriter;
			buttonEl.addEventListener("click", () => {
				void this.acceptProposal(proposal);
			});
		});
	}

	private renderRejectAction(parentEl: HTMLElement, proposal: KnowledgeProposal): void {
		parentEl.createEl("button", { text: "Reject" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.rejectProposal(proposal);
			});
		});
	}

	private async acceptProposal(proposal: KnowledgeProposal): Promise<void> {
		if (!this.proposalWriter) {
			new Notice("Mneme: Markdown writer is not available.");
			return;
		}

		try {
			const workflow = new InboxAcceptanceWorkflow({
				proposalStore: this.proposalStore,
				writer: this.proposalWriter,
			});
			const result = await workflow.acceptProposal(proposal.id);

			if (result.status === "accepted") {
				new Notice(result.kind === "concept" ? "Mneme: Concept accepted." : "Mneme: Card accepted.");
				await this.refresh();
				return;
			}

			if (result.status === "invalid") {
				new Notice("Mneme: Open proposal and fix errors before accepting.");
				return;
			}

			console.error("Mneme: proposal acceptance failed", result);
			new Notice(result.kind === "card"
				? "Mneme: Card write failed. See console."
				: "Mneme: Concept write failed. See console.");
		} catch (error) {
			console.error("Mneme: failed to accept proposal", {
				error,
				proposalId: proposal.id,
			});
			new Notice("Mneme: Proposal acceptance failed. See console.");
		}
	}

	private async rejectProposal(proposal: KnowledgeProposal): Promise<void> {
		try {
			if (this.proposalWriter) {
				const workflow = new InboxAcceptanceWorkflow({
					proposalStore: this.proposalStore,
					writer: this.proposalWriter,
				});
				await workflow.rejectProposal(proposal.id);
			} else {
				await this.proposalStore.updateProposalStatus(proposal.id, "rejected");
			}

			new Notice("Mneme: Proposal rejected.");
			await this.refresh();
		} catch (error) {
			console.error("Mneme: failed to reject proposal", error);
			new Notice("Mneme: Proposal could not be rejected.");
		}
	}

}

function getSourceLinkIndicator(proposal: KnowledgeProposal): string | undefined {
	if (proposal.status !== "written" || proposal.kind !== "new_concept") {
		return undefined;
	}

	if (hasSourceLinkData(proposal)) {
		return "Source links indexed";
	}

	return "No source links";
}

function hasSourceLinkData(proposal: KnowledgeProposal): boolean {
	const payload = typeof proposal.payload === "object" && proposal.payload !== null
		? proposal.payload as { proposedSourceLinks?: unknown }
		: undefined;
	const proposedSourceLinks = payload?.proposedSourceLinks;

	return Boolean(proposal.sourcePath)
		|| (Array.isArray(proposedSourceLinks) && proposedSourceLinks.length > 0);
}

function summarizeProposals(proposals: KnowledgeProposal[]): Record<"approved" | "pending" | "rejected" | "stale" | "written", number> {
	const activeProposals = filterActiveInboxProposals(proposals);
	return {
		approved: proposals.filter((proposal) => proposal.status === "approved").length,
		pending: activeProposals.filter((proposal) => isPendingStatus(proposal.status)).length,
		rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
		stale: proposals.filter((proposal) => proposal.status === "stale").length,
		written: proposals.filter((proposal) => proposal.status === "written").length,
	};
}

function countRemovedItems(
	result: Awaited<ReturnType<VaultStateReconciler["reconcile"]>> | undefined,
): number {
	if (!result) {
		return 0;
	}

	return result.removedProposalIds.length
		+ result.removedSourcePaths.length
		+ result.removedConceptSourceLinkIds.length;
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
		getProposalTargetLabel(proposal),
		evidenceCount > 0 ? `${evidenceCount} evidence ${evidenceCount === 1 ? "item" : "items"}` : undefined,
	];

	return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function getValidationSummary(proposal: KnowledgeProposal): string {
	if (proposal.status === "written") {
		return "Written";
	}

	if (proposal.status === "rejected") {
		return "Rejected";
	}

	const validation = validateKnowledgeProposalPayload(proposal);

	return validation.valid ? "Ready to accept" : "Needs edits";
}
