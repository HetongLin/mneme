import { App, Modal, Notice } from "obsidian";
import type { KnowledgeProposal, KnowledgeProposalPayload } from "../models/knowledgeProposal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import {
	getAcceptanceKind,
	InboxAcceptanceWorkflow,
} from "../services/inboxAcceptanceWorkflow";
import { canTransitionProposalStatus } from "../services/knowledgeProposalLifecycle";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import {
	getProposalEvidenceCount,
	getProposalPreview,
	getProposalSourcePath,
	getProposalTargetLabel,
	getProposalTitle,
} from "../services/knowledgeProposalDisplay";
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
		this.titleEl.setText("Proposal Review");
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

		this.renderSummary(contentEl);
		this.renderProposedChange(contentEl);
		this.renderSourceEvidence(contentEl);
		this.renderStructuredEditor(contentEl);
		this.renderValidation(contentEl, validation.errors, validation.warnings);

		this.renderRawJsonEditor(contentEl);

		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		if (getAcceptanceKind(this.proposal)) {
			actionsEl.createEl("button", { text: "Accept" }, (buttonEl) => {
				buttonEl.disabled = !this.options.writer;
				buttonEl.title = this.options.writer
					? "Validate and write this proposal to Markdown."
					: "Markdown writer is not available.";
				buttonEl.addEventListener("click", () => {
					void this.accept();
				});
			});
		}
		actionsEl.createEl("button", { text: "Reject" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.reject();
			});
		});
		actionsEl.createEl("button", { text: "Close" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.close());
		});
	}

	private renderSummary(parentEl: HTMLElement): void {
		const metadataEl = parentEl.createDiv({ cls: "mneme-proposal-detail-modal-metadata" });
		const rows = [
			["Title", getProposalTitle(this.proposal)],
			["Source", getProposalSourcePath(this.proposal)],
			["Target", getProposalTargetLabel(this.proposal)],
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

	private renderProposedChange(parentEl: HTMLElement): void {
		parentEl.createEl("h3", { text: "Proposed Change" });
		parentEl.createEl("p", {
			cls: "mneme-review-status",
			text: getProposalPreview(this.proposal),
		});
	}

	private renderSourceEvidence(parentEl: HTMLElement): void {
		parentEl.createEl("h3", { text: "Source Evidence" });
		parentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `${getProposalEvidenceCount(this.proposal)} evidence ${getProposalEvidenceCount(this.proposal) === 1 ? "item" : "items"}.`,
		});
	}

	private renderStructuredEditor(parentEl: HTMLElement): void {
		parentEl.createEl("h3", { text: "Edit" });

		if (this.proposal.kind === "new_concept") {
			this.renderNewConceptEditor(parentEl);
			return;
		}

		if (this.proposal.kind === "new_card") {
			this.renderNewCardEditor(parentEl);
			return;
		}

		if (this.proposal.kind === "update_concept") {
			this.renderConceptUpdateEditor(parentEl);
			return;
		}

		parentEl.createEl("p", {
			cls: "mneme-review-status",
			text: "Structured editing for this proposal type is not available yet. Use Advanced / Raw JSON.",
		});
	}

	private renderNewConceptEditor(parentEl: HTMLElement): void {
		const payload: Record<string, unknown> = isRecord(this.proposal.payload) ? this.proposal.payload : {};
		const titleInput = this.createTextInput(parentEl, "Concept title", getString(payload, "title"));
		const summaryInput = this.createTextareaInput(parentEl, "Summary", getString(payload, "summary"));
		const coreMeaningInput = this.createTextareaInput(parentEl, "Core Meaning", getString(payload, "coreMeaning"));
		const learningModeInput = this.createSelectInput(parentEl, "Learning Mode", getString(payload, "learningMode"), [
			["reviewable", "Reviewable"],
			["exploratory", "Exploratory"],
		], "reviewable");
		const importanceInput = this.createSelectInput(parentEl, "Importance", getString(payload, "suggestedImportance"), [
			["low", "Low"],
			["normal", "Normal"],
			["high", "High"],
			["critical", "Critical"],
		], "normal");
		const tagsInput = this.createTextInput(parentEl, "Tags", getStringArray(payload, "tags").join(", "));

		parentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Proposed cards: ${Array.isArray(payload.proposedCards) ? payload.proposedCards.length : 0}`,
		});

		this.createSaveEditsButton(parentEl, () => ({
			...payload,
			coreMeaning: coreMeaningInput.value,
			learningMode: learningModeInput.value,
			suggestedImportance: importanceInput.value,
			summary: summaryInput.value,
			tags: parseTags(tagsInput.value),
			title: titleInput.value,
		}));
	}

	private renderNewCardEditor(parentEl: HTMLElement): void {
		const payload: Record<string, unknown> = isRecord(this.proposal.payload) ? this.proposal.payload : {};
		const card: Record<string, unknown> = isRecord(payload.card) ? payload.card : {};
		const frontInput = this.createTextareaInput(parentEl, "Front", getString(card, "front"));
		const backInput = this.createTextareaInput(parentEl, "Back", getString(card, "back"));
		const rubricInput = this.createTextareaInput(parentEl, "Rubric", getString(card, "rubric"));
		const cardTypeInput = this.createTextInput(parentEl, "Card Type", getString(card, "cardType"));

		this.createSaveEditsButton(parentEl, () => ({
			...payload,
			card: {
				...card,
				back: backInput.value,
				cardType: cardTypeInput.value,
				front: frontInput.value,
				rubric: rubricInput.value,
			},
		}));
	}

	private renderConceptUpdateEditor(parentEl: HTMLElement): void {
		const payload: Record<string, unknown> = isRecord(this.proposal.payload) ? this.proposal.payload : {};
		const coreMeaningInput = this.createTextareaInput(
			parentEl,
			"Proposed Core Meaning",
			getString(payload, "proposedCoreMeaning"),
		);
		const summaryInput = this.createTextareaInput(
			parentEl,
			"Proposed Why It Matters",
			getString(payload, "proposedSummary"),
		);
		const reasonInput = this.createTextareaInput(
			parentEl,
			"Update Reason",
			getString(payload, "updateReason"),
		);

		this.createSaveEditsButton(parentEl, () => ({
			...payload,
			proposedCoreMeaning: coreMeaningInput.value,
			proposedSummary: summaryInput.value,
			updateReason: reasonInput.value,
		}));
	}

	private createTextInput(parentEl: HTMLElement, label: string, value = ""): HTMLInputElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const inputEl = labelEl.createEl("input", {
			attr: {
				type: "text",
			},
		});
		inputEl.value = value;

		return inputEl;
	}

	private createSelectInput(
		parentEl: HTMLElement,
		label: string,
		value: string | undefined,
		options: Array<[string, string]>,
		fallbackValue?: string,
	): HTMLSelectElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const selectEl = labelEl.createEl("select");
		const optionValues = new Set(options.map(([optionValue]) => optionValue));
		const selectedValue = value && optionValues.has(value)
			? value
			: fallbackValue && optionValues.has(fallbackValue)
				? fallbackValue
				: options[0]?.[0] ?? "";

		for (const [optionValue, optionLabel] of options) {
			const optionEl = selectEl.createEl("option", {
				text: optionLabel,
				value: optionValue,
			});

			optionEl.selected = optionValue === selectedValue;
		}

		return selectEl;
	}

	private createTextareaInput(parentEl: HTMLElement, label: string, value = ""): HTMLTextAreaElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const inputEl = labelEl.createEl("textarea", {
			attr: {
				spellcheck: "true",
			},
			cls: "mneme-proposal-detail-field-textarea",
		});
		inputEl.value = value;

		return inputEl;
	}

	private createSaveEditsButton(parentEl: HTMLElement, getPayload: () => Record<string, unknown>): void {
		parentEl.createEl("button", { text: "Save Edits" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.savePayload(getPayload() as unknown as KnowledgeProposalPayload);
			});
		});
	}

	private renderRawJsonEditor(parentEl: HTMLElement): void {
		const detailsEl = parentEl.createEl("details", { cls: "mneme-review-details" });
		detailsEl.createEl("summary", { text: "Advanced / Raw JSON" });
		const textareaEl = detailsEl.createEl("textarea", {
			attr: {
				"aria-label": "Proposal payload JSON",
				spellcheck: "false",
			},
			cls: "mneme-proposal-detail-modal-textarea",
		});
		textareaEl.value = JSON.stringify(this.proposal.payload ?? {}, null, 2);
		detailsEl.createEl("button", { text: "Save Raw JSON" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.saveEdits(textareaEl.value);
			});
		});
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

		await this.savePayload(payload as KnowledgeProposalPayload);
	}

	private async savePayload(payload: KnowledgeProposalPayload): Promise<void> {
		const nextStatus = canTransitionProposalStatus(this.proposal.status, "edited")
			? "edited"
			: this.proposal.status;
		const nextProposal = {
			...this.proposal,
			payload,
			status: nextStatus,
			updatedAt: new Date().toISOString(),
		} as KnowledgeProposal;

		await this.options.store.upsertProposal(nextProposal);
		this.proposal = nextProposal;
		await this.options.onChange?.();
		new Notice("Mneme: Proposal edits saved.");
		this.renderContent();
	}

	private async accept(): Promise<void> {
		if (!this.options.writer) {
			new Notice("Mneme: Markdown writer is not available.");
			return;
		}

		try {
			const workflow = new InboxAcceptanceWorkflow({
				proposalStore: this.options.store,
				writer: this.options.writer,
			});
			const result = await workflow.acceptProposal(this.proposal.id);

			if (result.status === "accepted") {
				await this.options.onChange?.();
				new Notice(result.kind === "concept" ? "Mneme: Concept accepted." : "Mneme: Card accepted.");
				this.close();
				return;
			}

			if (result.status === "invalid") {
				console.warn("Mneme: proposal validation failed", result.errors);
				new Notice("Mneme: Fix proposal errors before accepting.");
				this.renderContent();
				return;
			}

			console.error("Mneme: proposal acceptance failed", result);
			new Notice(result.kind === "card"
				? "Mneme: Card write failed. See console."
				: "Mneme: Concept write failed. See console.");
		} catch (error) {
			console.error("Mneme: proposal acceptance failed", error);
			new Notice("Mneme: Proposal acceptance failed. See console.");
		}
	}

	private async reject(): Promise<void> {
		try {
			const workflow = this.options.writer
				? new InboxAcceptanceWorkflow({
					proposalStore: this.options.store,
					writer: this.options.writer,
				})
				: undefined;

			if (workflow) {
				const result = await workflow.rejectProposal(this.proposal.id);

				if (result.status !== "accepted") {
					new Notice("Mneme: Proposal could not be rejected.");
					return;
				}
			} else {
				this.proposal = await this.options.store.updateProposalStatus(this.proposal.id, "rejected");
			}

			await this.options.onChange?.();
			new Notice("Mneme: Proposal rejected.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to reject proposal", error);
			new Notice("Mneme: Proposal could not be rejected.");
		}
	}
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];

	return typeof value === "string" ? value : undefined;
}

function getStringArray(record: Record<string, unknown>, key: string): string[] {
	const value = record[key];

	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseTags(value: string): string[] {
	return [...new Set(value
		.split(",")
		.map((tag) => tag.trim().replace(/^#+/, "").toLocaleLowerCase().replace(/[^a-z0-9/_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))
		.filter((tag) => tag.length > 0))]
		.slice(0, 5);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
