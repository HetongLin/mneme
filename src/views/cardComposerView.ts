import { Component, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { ConceptSummary } from "../models/conceptLibrary";
import {
	createEmptyManualCardDraft,
	isMeaningfulManualCardDraft,
	type ManualCardDraft,
} from "../models/manualCardDraft";
import { CARD_DRAFT_TYPES, type CardDraftType } from "../models/knowledgeProposal";
import type { ManualCardDraftStore } from "../services/manualCardDraftStore";
import type { ManualCardCreationResult } from "../services/manualCardWriteService";
import type { ManualCardWriteReceipt } from "../models/manualCardWrite";
import { CARD_TYPE_DESCRIPTIONS, CARD_TYPE_LABELS } from "../services/cardTypeDisplay";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";

export const CARD_COMPOSER_VIEW_TYPE = "mneme-card-composer-view";

export interface CardComposerOptions {
	create(draft: ManualCardDraft, concept?: ConceptSummary): Promise<ManualCardCreationResult>;
	draftStore: ManualCardDraftStore;
	listConcepts(): Promise<ConceptSummary[]>;
	onCreated(result: ManualCardCreationResult): Promise<void> | void;
	openCardsMarkdown(path: string): Promise<void> | void;
	viewConcept(concept: ConceptSummary): Promise<void> | void;
}

export class MnemeCardComposerView extends ItemView {
	private backEl!: HTMLTextAreaElement;
	private cardTypeDescriptionEl!: HTMLElement;
	private cardTypeEl!: HTMLSelectElement;
	private conceptEl!: HTMLSelectElement;
	private concepts: ConceptSummary[] = [];
	private createButtonEl!: HTMLButtonElement;
	private createdResultEl!: HTMLElement;
	private draft = createEmptyManualCardDraft();
	private frontEl!: HTMLTextAreaElement;
	private hasRendered = false;
	private isReady = false;
	private isSaving = false;
	private readonly markdownComponent = new Component();
	private pendingConceptId?: string;
	private rubricEl!: HTMLTextAreaElement;
	private saveQueue: Promise<void> = Promise.resolve();
	private saveTimer?: number;
	private createCompletion?: Promise<void>;
	private loadError?: string;
	private pendingWrite?: ManualCardWriteReceipt;
	private lifecycleToken = 0;

	constructor(leaf: WorkspaceLeaf, private readonly options: CardComposerOptions) {
		super(leaf);
	}

	getViewType(): string {
		return CARD_COMPOSER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Card Composer";
	}

	getIcon(): string {
		return "square-plus";
	}

	protected async onOpen(): Promise<void> {
		const token = ++this.lifecycleToken;
		this.isReady = false;
		this.loadError = undefined;
		this.contentEl.addClass("mneme-review-view", "mneme-concept-composer-view", "mneme-card-composer-view");
		this.markdownComponent.load();
		try {
			this.concepts = await this.options.listConcepts();
			if (token !== this.lifecycleToken) return;
			const state = await this.options.draftStore.getState();
			if (token !== this.lifecycleToken) return;
			this.draft = state.draft;
			this.pendingWrite = state.pendingWrite;
		} catch (error) {
			console.error("Mneme: failed to load Card Composer", error);
			if (token !== this.lifecycleToken) return;
			this.loadError = "Card Composer could not load its saved draft. Close and reopen to try again.";
			this.draft = createEmptyManualCardDraft(this.pendingConceptId);
			this.pendingWrite = undefined;
		}
		if (token !== this.lifecycleToken) return;
		this.ensureSelectedConcept();
		this.render();
		this.isReady = true;
	}

	protected async onClose(): Promise<void> {
		this.lifecycleToken += 1;
		if (this.saveTimer !== undefined) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
		const shouldFlushDraft = this.isReady && !this.loadError && !this.pendingWrite && !this.createCompletion;
		this.isReady = false;
		if (this.createCompletion) await this.createCompletion;
		if (shouldFlushDraft) {
			try {
				await this.flushDraft();
			} catch (error) {
				console.error("Mneme: failed to save Card Composer draft", error);
			}
		}
		this.markdownComponent.unload();
		this.contentEl.empty();
		this.hasRendered = false;
		if (this.saveTimer !== undefined) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
	}

	async prepare(defaultConceptId?: string): Promise<void> {
		this.pendingConceptId = defaultConceptId;
		if (!this.isReady || this.isSaving || this.pendingWrite || this.loadError) return;
		this.concepts = await this.options.listConcepts();
		if (!this.isReady || this.isSaving || this.pendingWrite || this.loadError) return;
		this.draft = this.readDraft();
		if (defaultConceptId && !isMeaningfulManualCardDraft(this.draft)) {
			this.draft = { ...this.draft, conceptId: defaultConceptId };
		}
		this.ensureSelectedConcept();
		this.render();
		await this.persistCurrentDraft();
	}

	private ensureSelectedConcept(): void {
		if (isMeaningfulManualCardDraft(this.draft) || this.pendingWrite) return;
		const selectedExists = this.concepts.some((concept) => concept.conceptId === this.draft.conceptId);
		if (selectedExists) return;
		const fallback = this.concepts.find((concept) => concept.conceptId === this.pendingConceptId) ?? this.concepts[0];
		this.draft = { ...this.draft, conceptId: fallback?.conceptId };
	}

	private render(): void {
		this.contentEl.empty();
		const headerEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-header" });
		headerEl.createEl("h2", { cls: "mneme-review-title", text: "Create Card" });
		headerEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Keep the Concept visible, choose the assessment type, then write the Card.",
		});
		this.createdResultEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-created-result" });
		if (this.loadError) this.contentEl.createEl("p", { cls: "mneme-review-status", text: this.loadError });
		if (this.pendingWrite) this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: "A Card creation is pending. Resume it to finish writing the Card before editing this draft.",
		});

		const formEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-form" });
		this.conceptEl = this.createConceptSelect(formEl);
		this.cardTypeEl = this.createCardTypeSelect(formEl);
		this.cardTypeDescriptionEl = formEl.createEl("small", { cls: "mneme-card-composer-type-description" });
		this.updateCardTypeDescription();

		const sourcePath = this.getSelectedConcept()?.path ?? "";
		this.frontEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Front",
			parentEl: formEl,
			placeholder: "Write one clear retrieval question or prompt.",
			sourcePath,
			value: this.draft.front,
		});
		this.backEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Back",
			parentEl: formEl,
			placeholder: "Write the concise answer the learner should recall.",
			sourcePath,
			value: this.draft.back,
		});
		this.rubricEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Rubric (optional)",
			parentEl: formEl,
			placeholder: "What must a strong answer include?",
			sourcePath,
			value: this.draft.rubric,
		});

		const actionsEl = formEl.createDiv({ cls: "mneme-concept-composer-actions" });
		this.createButtonEl = actionsEl.createEl("button", {
			cls: "mod-cta",
			text: this.pendingWrite ? "Resume Creation" : "Create Card",
		});
		this.createButtonEl.addEventListener("click", () => void this.createCard());
		formEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
			event.preventDefault();
			void this.createCard();
		});

		for (const element of [this.conceptEl, this.cardTypeEl, this.frontEl, this.backEl, this.rubricEl]) {
			element.addEventListener("input", () => this.onDraftChanged());
			element.addEventListener("change", () => this.onDraftChanged());
		}
		this.cardTypeEl.addEventListener("change", () => this.updateCardTypeDescription());
		this.hasRendered = true;
		this.updateControls();
		if (this.pendingWrite) {
			const cardsPath = this.pendingWrite.cardsPath;
			const openCardsButton = actionsEl.createEl("button", { text: "Open Cards Markdown" });
			openCardsButton.addEventListener("click", () => void this.options.openCardsMarkdown(cardsPath));
		}
	}

	private createConceptSelect(parentEl: HTMLElement): HTMLSelectElement {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		fieldEl.createEl("span", { text: "Concept" });
		const selectEl = fieldEl.createEl("select");
		if (this.concepts.length === 0) selectEl.createEl("option", { text: "No approved Concepts", value: "" });
		if (this.draft.conceptId && !this.concepts.some((concept) => concept.conceptId === this.draft.conceptId)) {
			const unavailable = selectEl.createEl("option", { text: `Unavailable Concept (${this.draft.conceptId})`, value: this.draft.conceptId });
			unavailable.selected = true;
		}
		for (const concept of this.concepts) {
			const optionEl = selectEl.createEl("option", { text: concept.title, value: concept.conceptId });
			optionEl.selected = concept.conceptId === this.draft.conceptId;
		}
		return selectEl;
	}

	private createCardTypeSelect(parentEl: HTMLElement): HTMLSelectElement {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field mneme-card-composer-type" });
		fieldEl.createEl("span", { text: "Card Type" });
		const selectEl = fieldEl.createEl("select");
		for (const cardType of CARD_DRAFT_TYPES) {
			const optionEl = selectEl.createEl("option", { text: CARD_TYPE_LABELS[cardType], value: cardType });
			optionEl.selected = cardType === this.draft.cardType;
		}
		return selectEl;
	}

	private updateCardTypeDescription(): void {
		if (!this.cardTypeDescriptionEl) return;
		this.cardTypeDescriptionEl.setText(CARD_TYPE_DESCRIPTIONS[this.cardTypeEl.value as CardDraftType]);
	}

	private onDraftChanged(): void {
		this.createdResultEl.empty();
		this.scheduleDraftSave();
	}

	private scheduleDraftSave(): void {
		if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = undefined;
			void this.persistCurrentDraft().catch((error) => {
				console.error("Mneme: failed to auto-save Card Composer draft", error);
			});
		}, 250);
	}

	private async flushDraft(): Promise<void> {
		if (this.saveTimer !== undefined) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
		await this.persistCurrentDraft();
	}

	private persistCurrentDraft(): Promise<void> {
		if (this.pendingWrite || this.loadError) return Promise.resolve();
		const draft = this.readDraft();
		this.draft = draft;
		this.saveQueue = this.saveQueue.catch(() => undefined).then(() => isMeaningfulManualCardDraft(draft)
			? this.options.draftStore.saveDraft(draft)
			: this.options.draftStore.clearDraft(draft.draftId!));
		return this.saveQueue;
	}

	private readDraft(): ManualCardDraft {
		if (!this.hasRendered) return this.draft;
		return {
			draftId: this.draft.draftId,
			back: this.backEl.value,
			cardType: this.cardTypeEl.value as CardDraftType,
			...(this.conceptEl.value ? { conceptId: this.conceptEl.value } : {}),
			front: this.frontEl.value,
			rubric: this.rubricEl.value,
			updatedAt: new Date().toISOString(),
		};
	}

	private getSelectedConcept(): ConceptSummary | undefined {
		return this.concepts.find((concept) => concept.conceptId === (this.hasRendered ? this.conceptEl.value : this.draft.conceptId));
	}

	private async createCard(): Promise<void> {
		if (this.isSaving || !this.isReady || this.loadError) return;
		const draft = this.readDraft();
		const concept = this.concepts.find((candidate) => candidate.conceptId === draft.conceptId);
		if (!this.pendingWrite && !concept) {
			new Notice("Mneme: Select an approved Concept first.");
			return;
		}
		if (!draft.front.trim() || !draft.back.trim()) {
			new Notice("Mneme: Front and Back are required.");
			return;
		}

		this.isSaving = true;
		this.updateControls();
		let resolveCompletion!: () => void;
		this.createCompletion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
		try {
			await this.flushDraft();
			const result = await this.options.create(draft, concept);
			this.draft = result.nextDraft;
			this.pendingWrite = undefined;
			if (this.isReady) {
				this.render();
			}
			if (this.isReady && concept) this.showCreatedResult(result, concept);
			new Notice(`Mneme: Card created (${result.cardId}).`);
			try {
				await this.options.onCreated(result);
			} catch (error) {
				console.error("Mneme: Card created but views could not be refreshed", error);
				new Notice("Mneme: Card created, but open views could not be refreshed.");
			}
		} catch (error) {
			console.error("Mneme: manual Card creation failed", error);
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Card could not be created."}`);
			try {
				const state = await this.options.draftStore.getState();
				const localDraftId = draft.draftId;
				if (state.pendingWrite || state.draft.draftId !== localDraftId) {
					this.draft = state.draft;
					this.pendingWrite = state.pendingWrite;
				}
				this.loadError = undefined;
				if (this.isReady) {
					this.ensureSelectedConcept();
					this.render();
				}
			} catch (reloadError) {
				console.error("Mneme: failed to reload Card Composer recovery state", reloadError);
				this.loadError = "Card creation status could not be checked. Close and reopen Card Composer before editing.";
				if (this.isReady) this.render();
			}
		} finally {
			this.isSaving = false;
			if (this.isReady) {
				this.updateControls();
			}
			resolveCompletion();
			this.createCompletion = undefined;
		}
	}

	private updateControls(): void {
		const disabled = this.isSaving || !!this.pendingWrite || !!this.loadError;
		for (const element of [this.conceptEl, this.cardTypeEl, this.frontEl, this.backEl, this.rubricEl]) {
			element.disabled = disabled;
		}
		this.createButtonEl.disabled = this.isSaving || !!this.loadError;
		this.createButtonEl.setText(this.isSaving ? "Creating..." : this.pendingWrite ? "Resume Creation" : "Create Card");
	}

	private showCreatedResult(result: ManualCardCreationResult, concept: ConceptSummary): void {
		this.createdResultEl.empty();
		const rowEl = this.createdResultEl.createDiv({ cls: "mneme-concept-composer-created" });
		const messageEl = rowEl.createDiv({ cls: "mneme-concept-composer-created-message" });
		messageEl.createEl("strong", { text: `Created: ${result.cardId}` });
		messageEl.createEl("span", { text: `Ready to create another Card for ${concept.title}.` });
		const actionsEl = rowEl.createDiv({ cls: "mneme-concept-composer-created-actions" });
		actionsEl.createEl("button", { cls: "mod-cta", text: "View Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.options.viewConcept(concept));
		});
		actionsEl.createEl("button", { text: "Open Cards Markdown" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.options.openCardsMarkdown(result.cardsPath));
		});
		this.contentEl.scrollTo({ behavior: "smooth", top: 0 });
	}
}
