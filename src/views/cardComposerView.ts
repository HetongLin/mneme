import { Component, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { ConceptSummary } from "../models/conceptLibrary";
import {
	createEmptyManualCardDraft,
	isMeaningfulManualCardDraft,
	type ManualCardDraft,
} from "../models/manualCardDraft";
import { CARD_DRAFT_TYPES, type CardDraftType } from "../models/knowledgeProposal";
import type { ManualCardDraftStore } from "../services/manualCardDraftStore";
import type { ManualCardInput, ManualCardResult } from "../services/manualCardService";
import { CARD_TYPE_DESCRIPTIONS, CARD_TYPE_LABELS } from "../services/cardTypeDisplay";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";

export const CARD_COMPOSER_VIEW_TYPE = "mneme-card-composer-view";

export interface CardComposerOptions {
	create(input: ManualCardInput): Promise<ManualCardResult>;
	draftStore: ManualCardDraftStore;
	listConcepts(): Promise<ConceptSummary[]>;
	onCreated(result: ManualCardResult): Promise<void> | void;
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
		this.contentEl.addClass("mneme-review-view", "mneme-concept-composer-view", "mneme-card-composer-view");
		this.markdownComponent.load();
		try {
			this.concepts = await this.options.listConcepts();
			const stored = await this.options.draftStore.getDraft();
			this.draft = stored ?? createEmptyManualCardDraft(this.pendingConceptId);
		} catch (error) {
			console.error("Mneme: failed to load Card Composer", error);
			this.draft = createEmptyManualCardDraft(this.pendingConceptId);
		}
		this.ensureSelectedConcept();
		this.render();
		this.isReady = true;
	}

	protected async onClose(): Promise<void> {
		if (this.saveTimer !== undefined) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
		const shouldFlushDraft = this.isReady && !this.createCompletion;
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
		if (!this.isReady || this.isSaving) return;
		this.concepts = await this.options.listConcepts();
		if (!this.isReady || this.isSaving) return;
		if (defaultConceptId && !isMeaningfulManualCardDraft(this.readDraft())) {
			this.draft = { ...this.readDraft(), conceptId: defaultConceptId };
		}
		this.ensureSelectedConcept();
		this.render();
		await this.persistCurrentDraft();
	}

	private ensureSelectedConcept(): void {
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
		this.createButtonEl = actionsEl.createEl("button", { cls: "mod-cta", text: "Create Card" });
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
	}

	private createConceptSelect(parentEl: HTMLElement): HTMLSelectElement {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		fieldEl.createEl("span", { text: "Concept" });
		const selectEl = fieldEl.createEl("select");
		if (this.concepts.length === 0) selectEl.createEl("option", { text: "No approved Concepts", value: "" });
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
		const draft = this.readDraft();
		this.draft = draft;
		this.saveQueue = this.saveQueue.catch(() => undefined).then(() => isMeaningfulManualCardDraft(draft)
			? this.options.draftStore.saveDraft(draft)
			: this.options.draftStore.clearDraft());
		return this.saveQueue;
	}

	private readDraft(): ManualCardDraft {
		if (!this.hasRendered) return this.draft;
		return {
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
		if (this.isSaving || !this.isReady) return;
		const draft = this.readDraft();
		const concept = this.concepts.find((candidate) => candidate.conceptId === draft.conceptId);
		if (!concept) {
			new Notice("Mneme: Select an approved Concept first.");
			return;
		}
		if (!draft.front.trim() || !draft.back.trim()) {
			new Notice("Mneme: Front and Back are required.");
			return;
		}

		this.isSaving = true;
		this.setComposerDisabled(true);
		this.createButtonEl.setText("Creating...");
		let resolveCompletion!: () => void;
		this.createCompletion = new Promise<void>((resolve) => { resolveCompletion = resolve; });
		try {
			await this.flushDraft();
			const result = await this.options.create({
				back: draft.back,
				cardType: draft.cardType,
				concept,
				front: draft.front,
				rubric: draft.rubric,
			});
			const isClosed = !this.isReady;
			if (isClosed) this.draft = createEmptyManualCardDraft(concept.conceptId);
			else this.resetAfterCreate(concept.conceptId);
			try {
				if (isClosed) await this.options.draftStore.clearDraft();
				else await this.persistCurrentDraft();
			} catch (error) {
				console.error("Mneme: Card created but draft cleanup failed", error);
				new Notice("Mneme: Card created, but the Composer draft could not be cleared. Check the existing Card before creating it again.");
			}
			if (this.isReady) this.showCreatedResult(result, concept);
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
		} finally {
			this.isSaving = false;
			if (this.isReady) {
				this.setComposerDisabled(false);
				this.createButtonEl.setText("Create Card");
			}
			resolveCompletion();
			this.createCompletion = undefined;
		}
	}

	private resetAfterCreate(conceptId: string): void {
		this.draft = createEmptyManualCardDraft(conceptId);
		this.conceptEl.value = conceptId;
		this.cardTypeEl.value = "definition";
		this.frontEl.value = "";
		this.backEl.value = "";
		this.rubricEl.value = "";
		for (const field of [this.frontEl, this.backEl, this.rubricEl]) field.dispatchEvent(new Event("input"));
		this.updateCardTypeDescription();
	}

	private setComposerDisabled(disabled: boolean): void {
		for (const element of [this.conceptEl, this.cardTypeEl, this.frontEl, this.backEl, this.rubricEl, this.createButtonEl]) {
			element.disabled = disabled;
		}
	}

	private showCreatedResult(result: ManualCardResult, concept: ConceptSummary): void {
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
