import { App, Component, Modal, Notice } from "obsidian";
import type { KnowledgeProposal, KnowledgeProposalPayload } from "../models/knowledgeProposal";
import { ApprovedProposalWriter } from "../services/approvedProposalWriter";
import {
	getAcceptanceKind,
	InboxAcceptanceWorkflow,
} from "../services/inboxAcceptanceWorkflow";
import { canTransitionProposalStatus } from "../services/knowledgeProposalLifecycle";
import { KnowledgeProposalStore } from "../services/knowledgeProposalStore";
import {
	type ProposalEvidenceDisplayItem,
	getProposalEvidenceItems,
	getProposalSourcePath,
	getProposalTargetLabel,
} from "../services/knowledgeProposalDisplay";
import { validateKnowledgeProposalPayload } from "../services/knowledgeProposalValidation";
import { getProposalStageLabel } from "../services/knowledgeProposalStage";
import { normalizeConceptTags } from "../services/conceptMarkdownRenderer";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";
import { formatUserFacingError, formatUserFacingMessage } from "../utils/userFacingError";

interface ProposalDetailModalOptions {
	onChange?(): Promise<void> | void;
	proposal: KnowledgeProposal;
	store: KnowledgeProposalStore;
	writer?: ApprovedProposalWriter;
}

export class ProposalDetailModal extends Modal {
	private collectStructuredPayload?: () => KnowledgeProposalPayload;
	private isActing = false;
	private markdownComponent = new Component();
	private proposal: KnowledgeProposal;

	constructor(
		app: App,
		private readonly options: ProposalDetailModalOptions,
	) {
		super(app);
		this.proposal = options.proposal;
	}

	onOpen(): void {
		this.markdownComponent.load();
		this.titleEl.setText("Proposal Review");
		void this.markOpenedIfPossible();
		this.renderContent();
	}

	onClose(): void {
		this.markdownComponent.unload();
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { contentEl } = this;
		const validation = validateKnowledgeProposalPayload(this.proposal);
		this.collectStructuredPayload = undefined;
		this.markdownComponent.unload();
		this.markdownComponent = new Component();
		this.markdownComponent.load();

		contentEl.empty();
		contentEl.addClass("mneme-proposal-detail-modal");

		this.renderSummary(contentEl);
		this.renderStructuredEditor(contentEl);
		this.renderSourceEvidence(contentEl);
		this.renderValidation(contentEl, validation.errors, validation.warnings);

		this.renderRawJsonEditor(contentEl);

		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		if (getAcceptanceKind(this.proposal)) {
			actionsEl.createEl("button", { text: "Accept & Next" }, (buttonEl) => {
				buttonEl.disabled = !this.options.writer;
				buttonEl.title = this.options.writer
					? "Save current edits, validate, and write this proposal to Markdown."
					: "Markdown writer is not available.";
				buttonEl.addEventListener("click", () => {
					void this.accept();
				});
			});
		}
		actionsEl.createEl("button", { text: "Reject & Next" }, (buttonEl) => {
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

	private renderSourceEvidence(parentEl: HTMLElement): void {
		const evidenceLabel = this.proposal.kind === "new_card" ? "Concept Grounding" : "Source Evidence";
		parentEl.createEl("h3", { text: evidenceLabel });
		const evidenceItems = getProposalEvidenceItems(this.proposal);

		if (evidenceItems.length === 0) {
			parentEl.createEl("p", {
				cls: "mneme-review-status",
				text: `No ${evidenceLabel.toLocaleLowerCase()} provided.`,
			});
			return;
		}

		const visibleEvidence = evidenceItems.slice(0, 5);
		const listEl = parentEl.createDiv({ cls: "mneme-proposal-evidence-list" });

		for (const evidence of visibleEvidence) {
			const itemEl = listEl.createDiv({ cls: "mneme-proposal-evidence-item" });
			const meta = formatEvidenceMeta(evidence);

			if (meta) {
				itemEl.createEl("p", {
					cls: "mneme-proposal-evidence-meta",
					text: meta,
				});
			}

			itemEl.createEl("blockquote", {
				cls: "mneme-proposal-evidence-excerpt",
				text: evidence.excerpt,
			});
		}

		const hiddenCount = evidenceItems.length - visibleEvidence.length;
		if (hiddenCount > 0) {
			parentEl.createEl("p", {
				cls: "mneme-review-status",
				text: `${hiddenCount} more evidence ${hiddenCount === 1 ? "item is" : "items are"} available in Advanced / Raw JSON.`,
			});
		}
	}

	private renderStructuredEditor(parentEl: HTMLElement): void {
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
		titleInput.addClass("mneme-concept-title-input");
		const coreMeaningInput = this.createTextareaInput(parentEl, "Core Meaning", getString(payload, "coreMeaning"));
		const whyItMattersInput = this.createTextareaInput(parentEl, "Why It Matters", getString(payload, "whyItMatters"));
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

		this.collectStructuredPayload = () => ({
			...payload,
			coreMeaning: coreMeaningInput.value,
			learningMode: learningModeInput.value,
			suggestedImportance: importanceInput.value,
			tags: parseTags(tagsInput.value),
			title: titleInput.value,
			whyItMatters: whyItMattersInput.value,
		}) as KnowledgeProposalPayload;
	}

	private renderNewCardEditor(parentEl: HTMLElement): void {
		const payload: Record<string, unknown> = isRecord(this.proposal.payload) ? this.proposal.payload : {};
		const card: Record<string, unknown> = isRecord(payload.card) ? payload.card : {};
		const frontInput = this.createTextareaInput(parentEl, "Front", getString(card, "front"));
		const backInput = this.createTextareaInput(parentEl, "Back", getString(card, "back"));
		const rubricInput = this.createTextareaInput(parentEl, "Rubric", getString(card, "rubric"));
		const cardTypeInput = this.createTextInput(parentEl, "Card Type", getString(card, "cardType"));

		this.collectStructuredPayload = () => ({
			...payload,
			card: {
				...card,
				back: backInput.value,
				cardType: cardTypeInput.value,
				front: frontInput.value,
				rubric: rubricInput.value,
			},
		}) as KnowledgeProposalPayload;
	}

	private renderConceptUpdateEditor(parentEl: HTMLElement): void {
		const payload: Record<string, unknown> = isRecord(this.proposal.payload) ? this.proposal.payload : {};
		const coreMeaningInput = this.createTextareaInput(
			parentEl,
			"Proposed Core Meaning",
			getString(payload, "proposedCoreMeaning"),
		);
		const whyItMattersInput = this.createTextareaInput(
			parentEl,
			"Proposed Why It Matters",
			getString(payload, "proposedWhyItMatters"),
		);
		const reasonInput = this.createTextareaInput(
			parentEl,
			"Update Reason",
			getString(payload, "updateReason"),
		);

		this.collectStructuredPayload = () => ({
			...payload,
			proposedCoreMeaning: coreMeaningInput.value,
			proposedWhyItMatters: whyItMattersInput.value,
			updateReason: reasonInput.value,
		}) as KnowledgeProposalPayload;
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
		return createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label,
			parentEl,
			sourcePath: getProposalSourcePath(this.proposal) ?? "",
			value,
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

	private async savePayload(
		payload: KnowledgeProposalPayload,
		options: { notify?: boolean; render?: boolean } = {},
	): Promise<void> {
		if (JSON.stringify(payload) === JSON.stringify(this.proposal.payload)) return;
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
		if (options.notify !== false) new Notice("Mneme: Proposal edits saved.");
		if (options.render !== false) this.renderContent();
	}

	private async accept(): Promise<void> {
		if (this.isActing) return;
		if (!this.options.writer) {
			new Notice("Mneme: Markdown writer is not available.");
			return;
		}

		this.isActing = true;
		try {
			const structuredPayload = this.collectStructuredPayload?.();
			if (structuredPayload) {
				await this.savePayload(structuredPayload, { notify: false, render: false });
			}
			const workflow = new InboxAcceptanceWorkflow({
				proposalStore: this.options.store,
				writer: this.options.writer,
			});
			const result = await workflow.acceptProposal(this.proposal.id);

			if (result.status === "accepted") {
				await this.finishCompletedAction(
					result.kind === "concept" ? "Concept accepted." : "Card accepted.",
				);
				return;
			}

			if (result.status === "invalid") {
				console.warn("Mneme: proposal validation failed", result.errors);
				new Notice("Mneme: Fix proposal errors before accepting.");
				this.renderContent();
				return;
			}

			console.error("Mneme: proposal acceptance failed", result);
			const operation = result.kind === "card" ? "Card write failed" : "Concept write failed";
			new Notice(`Mneme: ${operation}: ${formatUserFacingMessage(result.message, "Try again.")}`);
		} catch (error) {
			console.error("Mneme: proposal acceptance failed", error);
			new Notice(`Mneme: Proposal acceptance failed: ${formatUserFacingError(error, "Try again.")}`);
		} finally {
			this.isActing = false;
		}
	}

	private async reject(): Promise<void> {
		if (this.isActing) return;
		this.isActing = true;
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
					new Notice(`Mneme: Proposal could not be rejected: ${formatUserFacingMessage(result.message, "Try again.")}`);
					return;
				}
			} else {
				this.proposal = await this.options.store.updateProposalStatus(this.proposal.id, "rejected");
			}

			await this.finishCompletedAction("Proposal rejected.");
		} catch (error) {
			console.error("Mneme: failed to reject proposal", error);
			new Notice(`Mneme: Proposal could not be rejected: ${formatUserFacingError(error, "Try again.")}`);
		} finally {
			this.isActing = false;
		}
	}

	private async finishCompletedAction(message: string): Promise<void> {
		try {
			await this.advanceOrClose();
			new Notice(`Mneme: ${message}`);
		} catch (error) {
			console.error("Mneme: proposal completed but Inbox could not refresh", error);
			new Notice(`Mneme: ${message} Inbox refresh failed: ${formatUserFacingError(error, "Reopen Inbox.")}`);
			this.close();
		}
	}

	private async advanceOrClose(): Promise<void> {
		await this.options.onChange?.();
		const stage = getProposalStageLabel(this.proposal);
		const next = (await this.options.store.listActive())
			.find((proposal) => proposal.id !== this.proposal.id && getProposalStageLabel(proposal) === stage);
		if (!next) {
			this.close();
			return;
		}

		this.proposal = next;
		await this.markOpenedIfPossible();
		this.renderContent();
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
	return normalizeConceptTags(value.split(","));
}

function formatEvidenceMeta(evidence: ProposalEvidenceDisplayItem): string {
	const parts = [
		evidence.sourcePath,
		evidence.heading,
		formatLineRange(evidence),
	];

	return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

function formatLineRange(evidence: ProposalEvidenceDisplayItem): string | undefined {
	if (typeof evidence.lineStart !== "number") {
		return undefined;
	}

	if (typeof evidence.lineEnd === "number" && evidence.lineEnd !== evidence.lineStart) {
		return `lines ${evidence.lineStart}-${evidence.lineEnd}`;
	}

	return `line ${evidence.lineStart}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
