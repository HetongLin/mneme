import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import { ProposalDetailModal } from "../modals/proposalDetailModal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import {
	buildInboxProductSummary,
	getInboxEmptyState,
} from "../services/inboxDisplayModel";
import {
	filterActiveInboxProposals,
} from "../services/inboxProposalFilters";
import {
	InboxAcceptanceWorkflow,
} from "../services/inboxAcceptanceWorkflow";
import {
	getProposalTitle,
} from "../services/knowledgeProposalDisplay";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import {
	isCardStageProposal,
	isConceptStageProposal,
} from "../services/knowledgeProposalStage";
import type { VaultStateReconciler } from "../services/vaultStateReconciler";

export const INBOX_VIEW_TYPE = "mneme-inbox-view";
export type InboxTab = "concepts" | "cards" | "other";

export class MnemeInboxView extends ItemView {
	private activeTab: InboxTab = "concepts";
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
			const reconciledCount = countReconciledItems(reconciliationResult);

			this.statusMessage = reconciledCount > 0
				? `${activeCount} items ready for review. Reconciled ${reconciledCount} stale items.`
				: `${activeCount} items ready for review.`;

			if (options.showNotice) {
				new Notice(reconciledCount > 0
					? `Mneme: Inbox refreshed. Reconciled ${reconciledCount} stale items.`
					: "Mneme: Inbox refreshed.");
			}
		} catch (error) {
			console.error("Mneme: failed to load Inbox proposals", error);
			this.proposals = [];
			this.statusMessage = "Failed to load Inbox proposals. See console for details.";
		}

		this.render();
	}

	showTab(tab: InboxTab): void {
		this.activeTab = tab;
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
			text: "Review proposed knowledge changes before they enter your vault.",
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });
		toolbarEl.createEl("button", { text: "Refresh" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refresh({ showNotice: true });
			});
		});
	}

	private renderSummary(): void {
		const summary = buildInboxProductSummary(this.proposals);
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `To Review: ${summary.toReview}` });
		summaryEl.createEl("span", { text: `Concept Proposals: ${summary.conceptProposals}` });
		summaryEl.createEl("span", { text: `Card Proposals: ${summary.cardProposals}` });
		summaryEl.createEl("span", { text: `Invalid: ${summary.invalid}` });
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
			const emptyState = getInboxEmptyState();
			listEl.createEl("p", {
				cls: "mneme-review-empty",
				text: emptyState.title,
			});
			listEl.createEl("p", {
				cls: "mneme-review-status",
				text: emptyState.description,
			});
			return;
		}

		const groupedProposals = groupActiveProposals(activeProposals);
		this.activeTab = resolveActiveTab(this.activeTab, groupedProposals);
		this.renderProposalTabs(listEl, groupedProposals);
		this.renderProposalSection(listEl, getTabTitle(this.activeTab), sortProposals(groupedProposals[this.activeTab]));
	}

	private renderProposalSection(parentEl: HTMLElement, title: string, proposals: KnowledgeProposal[]): void {
		parentEl.createEl("h3", {
			cls: "mneme-inbox-section-title",
			text: title,
		});

		if (proposals.length === 0) {
			parentEl.createEl("p", {
				cls: "mneme-review-empty",
				text: `No ${title.toLocaleLowerCase()} ready for review.`,
			});
			return;
		}

		for (const proposal of proposals) {
			this.renderProposalCard(parentEl, proposal);
		}
	}

	private renderProposalTabs(parentEl: HTMLElement, proposals: Record<InboxTab, KnowledgeProposal[]>): void {
		const tabsEl = parentEl.createDiv({ cls: "mneme-inbox-tabs" });
		const tabs: Array<{ id: InboxTab; label: string }> = [
			{ id: "concepts", label: "Concepts" },
			{ id: "cards", label: "Cards" },
			{ id: "other", label: "Other" },
		];

		for (const tab of tabs) {
			tabsEl.createEl("button", {
				cls: tab.id === this.activeTab ? "mneme-inbox-tab is-active" : "mneme-inbox-tab",
				text: `${tab.label} (${proposals[tab.id].length})`,
			}, (buttonEl) => {
				buttonEl.disabled = proposals[tab.id].length === 0;
				buttonEl.addEventListener("click", () => {
					this.activeTab = tab.id;
					this.render();
				});
			});
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

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Open" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.openProposalDetail(proposal));
		});
		if (filterActiveInboxProposals([proposal]).length > 0) {
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

	private renderRejectAction(parentEl: HTMLElement, proposal: KnowledgeProposal): void {
		parentEl.createEl("button", { text: "Reject" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.rejectProposal(proposal);
			});
		});
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

function countReconciledItems(
	result: Awaited<ReturnType<VaultStateReconciler["reconcile"]>> | undefined,
): number {
	if (!result) {
		return 0;
	}

	return result.removedProposalIds.length
		+ result.removedSourcePaths.length
		+ result.removedConceptSourceLinkIds.length
		+ result.staleConceptSourceLinkIds.length;
}

function sortProposals(proposals: KnowledgeProposal[]): KnowledgeProposal[] {
	return [...proposals].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

function groupActiveProposals(proposals: KnowledgeProposal[]): Record<InboxTab, KnowledgeProposal[]> {
	return {
		cards: proposals.filter(isCardStageProposal),
		concepts: proposals.filter(isConceptStageProposal),
		other: proposals.filter((proposal) => {
			return !isConceptStageProposal(proposal) && !isCardStageProposal(proposal);
		}),
	};
}

function resolveActiveTab(activeTab: InboxTab, proposals: Record<InboxTab, KnowledgeProposal[]>): InboxTab {
	if (proposals[activeTab].length > 0) {
		return activeTab;
	}

	if (proposals.concepts.length > 0) {
		return "concepts";
	}

	if (proposals.cards.length > 0) {
		return "cards";
	}

	return "other";
}

function getTabTitle(tab: InboxTab): string {
	switch (tab) {
		case "concepts":
			return "Concept Proposals";
		case "cards":
			return "Card Proposals";
		case "other":
			return "Unsupported/Other Proposals";
	}
}
