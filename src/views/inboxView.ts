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
import {
	getGenerateToReviewProposals,
	resolveGenerateToReviewSession,
	shouldRunInboxReconciliation,
	type GenerateToReviewSession,
} from "../services/generateToReviewWorkflow";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import {
	isCardStageProposal,
	isConceptStageProposal,
} from "../services/knowledgeProposalStage";
import type { VaultStateReconciler } from "../services/vaultStateReconciler";
import { formatUserFacingError } from "../utils/userFacingError";
import type { ConceptSummary } from "../models/conceptLibrary";

export const INBOX_VIEW_TYPE = "mneme-inbox-view";
export type InboxTab = "concepts" | "cards" | "other";

export interface InboxViewActions {
	listConceptTags?(): Promise<string[]>;
	mergeConcepts?(existing: ConceptSummary, newConceptPath: string): Promise<void> | void;
	openConceptLibrary?(): Promise<void> | void;
	startConceptReview?(conceptId: string): Promise<"failed" | "no_cards" | "started">;
}

type GenerateToReviewCompletion =
	| { status: "all_rejected" }
	| { acceptedCount: number; status: "review_unavailable" };

export class MnemeInboxView extends ItemView {
	private activeTab: InboxTab = "concepts";
	private generateToReviewCompletion?: GenerateToReviewCompletion;
	private generateToReviewSession?: GenerateToReviewSession;
	private isCompletingGenerateToReview = false;
	private proposals: KnowledgeProposal[] = [];
	private statusMessage = "Loading proposals...";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly proposalStore: KnowledgeProposalStore,
		private readonly proposalWriter?: ApprovedProposalWriter,
		private readonly vaultStateReconciler?: VaultStateReconciler,
		private readonly actions: InboxViewActions = {},
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
			const reconciliationResult = shouldRunInboxReconciliation(this.generateToReviewSession)
				? await this.vaultStateReconciler?.reconcile()
				: undefined;
			this.proposals = await this.proposalStore.listProposals();
			const activeCount = filterActiveInboxProposals(this.getVisibleProposals()).length;
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
			this.statusMessage = `Failed to load Inbox proposals: ${formatUserFacingError(error, "Try Refresh again.")}`;
		}

		this.render();
	}

	showTab(tab: InboxTab): void {
		this.generateToReviewSession = undefined;
		this.generateToReviewCompletion = undefined;
		this.activeTab = tab;
		this.render();
	}

	async startGenerateToReview(session: GenerateToReviewSession): Promise<void> {
		this.generateToReviewSession = {
			...session,
			proposalIds: [...new Set(session.proposalIds)],
		};
		this.generateToReviewCompletion = undefined;
		this.activeTab = "cards";
		await this.refresh();
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
			text: this.generateToReviewSession
				? `Review Cards for ${this.generateToReviewSession.conceptTitle} before starting review.`
				: "Review proposed knowledge changes before they enter your vault.",
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });
		toolbarEl.createEl("button", { text: "Refresh" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refresh({ showNotice: true });
			});
		});
	}

	private renderSummary(): void {
		const summary = buildInboxProductSummary(this.getVisibleProposals());
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

		if (this.generateToReviewCompletion) {
			this.renderGenerateToReviewCompletion(listEl, this.generateToReviewCompletion);
			return;
		}

		const activeProposals = filterActiveInboxProposals(this.getVisibleProposals());

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
		if (this.generateToReviewSession) {
			this.activeTab = "cards";
			this.renderProposalSection(listEl, "Card Proposals", sortProposals(groupedProposals.cards));
			return;
		}
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
			buttonEl.addEventListener("click", () => void this.openProposalDetail(proposal));
		});
		if (filterActiveInboxProposals([proposal]).length > 0) {
			this.renderRejectAction(actionsEl, proposal);
		}
	}

	private async openProposalDetail(proposal: KnowledgeProposal): Promise<void> {
		let existingTags: string[] = [];
		try {
			existingTags = await this.actions.listConceptTags?.() ?? [];
		} catch (error) {
			console.error("Mneme: failed to load existing Concept tags for Inbox", error);
		}
		new ProposalDetailModal(this.app, {
			existingTags,
			onChange: () => this.refresh(),
			onMergeRequested: (existing, newConceptPath) => this.actions.mergeConcepts?.(
				existing,
				newConceptPath,
			),
			onQueueCompleted: () => this.finishGenerateToReviewIfResolved(),
			proposal,
			proposalScopeIds: this.generateToReviewSession?.proposalIds,
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
				const result = await workflow.rejectProposal(proposal.id);
				if (result.status !== "accepted") {
					new Notice("Mneme: Proposal could not be rejected.");
					return;
				}
			} else {
				await this.proposalStore.updateProposalStatus(proposal.id, "rejected");
			}

			new Notice("Mneme: Proposal rejected.");
			await this.refresh();
			await this.finishGenerateToReviewIfResolved();
		} catch (error) {
			console.error("Mneme: failed to reject proposal", error);
			new Notice("Mneme: Proposal could not be rejected.");
		}
	}

	private getVisibleProposals(): KnowledgeProposal[] {
		return this.generateToReviewSession
			? getGenerateToReviewProposals(this.proposals, this.generateToReviewSession)
			: this.proposals;
	}

	private async finishGenerateToReviewIfResolved(): Promise<void> {
		if (!this.generateToReviewSession || this.isCompletingGenerateToReview) return;
		const resolution = resolveGenerateToReviewSession(this.proposals, this.generateToReviewSession);

		if (resolution.status === "pending") return;
		if (resolution.status === "all_rejected") {
			this.generateToReviewCompletion = { status: "all_rejected" };
			this.statusMessage = "No Cards were accepted for this Concept.";
			this.render();
			return;
		}

		this.isCompletingGenerateToReview = true;
		try {
			const result = await this.actions.startConceptReview?.(this.generateToReviewSession.conceptId);

			if (result === "started") {
				this.generateToReviewSession = undefined;
				this.generateToReviewCompletion = undefined;
				return;
			}

			this.generateToReviewCompletion = {
				acceptedCount: resolution.acceptedCount,
				status: "review_unavailable",
			};
			this.statusMessage = "Cards were accepted, but Review could not start yet.";
			this.render();
		} catch (error) {
			console.error("Mneme: accepted Cards could not start Review", error);
			this.generateToReviewCompletion = {
				acceptedCount: resolution.acceptedCount,
				status: "review_unavailable",
			};
			this.statusMessage = "Cards were accepted, but Review could not start yet.";
			this.render();
		} finally {
			this.isCompletingGenerateToReview = false;
		}
	}

	private renderGenerateToReviewCompletion(
		parentEl: HTMLElement,
		completion: GenerateToReviewCompletion,
	): void {
		const completionEl = parentEl.createDiv({ cls: "mneme-review-queue-item" });
		completionEl.createEl("h3", {
			text: completion.status === "all_rejected"
				? "No Cards accepted"
				: `${completion.acceptedCount} ${completion.acceptedCount === 1 ? "Card was" : "Cards were"} accepted`,
		});
		completionEl.createEl("p", {
			cls: "mneme-review-status",
			text: completion.status === "all_rejected"
				? "Review did not start because every Card proposal in this batch was rejected."
				: "Mneme could not load the accepted Cards into Review yet. You can try again without regenerating them.",
		});

		const actionsEl = completionEl.createDiv({ cls: "mneme-review-actions" });
		if (completion.status === "review_unavailable") {
			actionsEl.createEl("button", { text: "Start Review" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					this.generateToReviewCompletion = undefined;
					void this.finishGenerateToReviewIfResolved();
				});
			});
		}
		actionsEl.createEl("button", { text: "Back to Concept Library" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.generateToReviewSession = undefined;
				this.generateToReviewCompletion = undefined;
				void this.actions.openConceptLibrary?.();
			});
		});
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
