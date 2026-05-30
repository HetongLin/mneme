import { App, Modal, Notice } from "obsidian";
import type { KnowledgeProposal, KnowledgeProposalPayload } from "../models/knowledgeProposal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import { canTransitionProposalStatus } from "../services/knowledgeProposalLifecycle";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import { validateKnowledgeProposalPayload } from "../services/knowledgeProposalValidation";

interface ProposalDetailModalOptions {
	onChange?(): Promise<void> | void;
	proposal: KnowledgeProposal;
	store: KnowledgeProposalStore;
	writer?: ApprovedProposalWriter;
}

export class ProposalDetailModal extends Modal {
	private proposal: KnowledgeProposal;

	constructor(
		app: App,
		private readonly options: ProposalDetailModalOptions,
	) {
		super(app);
		this.proposal = options.proposal;
	}

	onOpen(): void {
		this.titleEl.setText("Proposal Detail");
		void this.markOpenedIfPossible();
		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { contentEl } = this;
		const validation = validateKnowledgeProposalPayload(this.proposal);

		contentEl.empty();
		contentEl.addClass("mneme-proposal-detail-modal");

		this.renderMetadata(contentEl);
		this.renderValidation(contentEl, validation.errors, validation.warnings);

		contentEl.createEl("h3", { text: "Payload JSON" });
		const textareaEl = contentEl.createEl("textarea", {
			attr: {
				"aria-label": "Proposal payload JSON",
				spellcheck: "false",
			},
			cls: "mneme-proposal-detail-modal-textarea",
		});
		textareaEl.value = JSON.stringify(this.proposal.payload ?? {}, null, 2);

		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		actionsEl.createEl("button", { text: "Save Edits" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.saveEdits(textareaEl.value);
			});
		});
		actionsEl.createEl("button", { text: "Approve" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.approve();
			});
		});
		actionsEl.createEl("button", { text: "Reject" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.reject();
			});
		});
		this.renderWriteMarkdownAction(actionsEl);
		actionsEl.createEl("button", { text: "Close" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.close());
		});
	}

	private renderMetadata(parentEl: HTMLElement): void {
		const metadataEl = parentEl.createDiv({ cls: "mneme-proposal-detail-modal-metadata" });
		const rows = [
			["Kind", this.proposal.kind],
			["Status", this.proposal.status],
			["Source", this.proposal.sourcePath],
			["Concept", this.proposal.conceptId],
			["Card", this.proposal.cardId],
			["Created", this.proposal.createdAt],
			["Updated", this.proposal.updatedAt],
		];

		for (const [label, value] of rows) {
			if (!value) {
				continue;
			}

			metadataEl.createEl("p", {
				text: `${label}: ${value}`,
			});
		}
	}

	private renderValidation(parentEl: HTMLElement, errors: string[], warnings: string[]): void {
		if (errors.length === 0 && warnings.length === 0) {
			parentEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Proposal payload is ready for review.",
			});
			return;
		}

		const validationEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });

		if (errors.length > 0) {
			validationEl.createEl("h4", { text: "Errors" });
			const listEl = validationEl.createEl("ul");
			errors.forEach((error) => listEl.createEl("li", { text: error }));
		}

		if (warnings.length > 0) {
			validationEl.createEl("h4", { text: "Warnings" });
			const listEl = validationEl.createEl("ul");
			warnings.forEach((warning) => listEl.createEl("li", { text: warning }));
		}
	}

	private async markOpenedIfPossible(): Promise<void> {
		if (!canTransitionProposalStatus(this.proposal.status, "opened")) {
			return;
		}

		try {
			this.proposal = await this.options.store.updateProposalStatus(this.proposal.id, "opened");
			await this.options.onChange?.();
			this.renderContent();
		} catch (error) {
			console.error("Mneme: failed to mark proposal opened", error);
		}
	}

	private async saveEdits(payloadJson: string): Promise<void> {
		let payload: unknown;

		try {
			payload = JSON.parse(payloadJson);
		} catch (error) {
			console.error("Mneme: invalid proposal JSON", error);
			new Notice("Mneme: Invalid proposal JSON.");
			return;
		}

		const nextStatus = canTransitionProposalStatus(this.proposal.status, "edited")
			? "edited"
			: this.proposal.status;
		const nextProposal = {
			...this.proposal,
			payload: payload as KnowledgeProposalPayload,
			status: nextStatus,
			updatedAt: new Date().toISOString(),
		} as KnowledgeProposal;

		await this.options.store.upsertProposal(nextProposal);
		this.proposal = nextProposal;
		await this.options.onChange?.();
		new Notice("Mneme: Proposal edits saved.");
		this.renderContent();
	}

	private async approve(): Promise<void> {
		const validation = validateKnowledgeProposalPayload(this.proposal);

		if (!validation.valid) {
			new Notice("Mneme: Fix proposal errors before approval.");
			this.renderContent();
			return;
		}

		try {
			this.proposal = await this.options.store.updateProposalStatus(this.proposal.id, "approved");
			await this.options.onChange?.();
			new Notice("Mneme: Proposal approved.");
			this.renderContent();
		} catch (error) {
			console.error("Mneme: failed to approve proposal", error);
			new Notice("Mneme: Invalid proposal status transition.");
		}
	}

	private async reject(): Promise<void> {
		try {
			this.proposal = await this.options.store.updateProposalStatus(this.proposal.id, "rejected");
			await this.options.onChange?.();
			new Notice("Mneme: Proposal rejected.");
			this.renderContent();
		} catch (error) {
			console.error("Mneme: failed to reject proposal", error);
			new Notice("Mneme: Invalid proposal status transition.");
		}
	}

	private renderWriteMarkdownAction(parentEl: HTMLElement): void {
		parentEl.createEl("button", { text: "Write Markdown" }, (buttonEl) => {
			buttonEl.disabled = !this.options.writer
				|| this.proposal.status !== "approved";
			buttonEl.title = this.proposal.status === "approved"
				? "Write approved proposal to Markdown."
				: "Approve before writing Markdown.";
			buttonEl.addEventListener("click", () => {
				void this.writeMarkdown();
			});
		});
	}

	private async writeMarkdown(): Promise<void> {
		if (!this.options.writer) {
			new Notice("Mneme: Markdown writer is not available.");
			return;
		}

		try {
			const result = await this.options.writer.writeApprovedProposal(this.proposal.id);

			if (result.status === "written") {
				const updatedProposal = await this.options.store.getProposal(this.proposal.id);

				if (updatedProposal) {
					this.proposal = updatedProposal;
				}

				await this.options.onChange?.();
				new Notice("Mneme: Markdown written.");
				this.renderContent();
				return;
			}

			if (result.status === "skipped") {
				new Notice("Mneme: This proposal type cannot be written yet.");
				return;
			}

			console.error("Mneme: Markdown write failed", result);
			new Notice("Mneme: Markdown write failed. See console.");
		} catch (error) {
			console.error("Mneme: Markdown write failed", error);
			new Notice("Mneme: Markdown write failed. See console.");
		}
	}
}
