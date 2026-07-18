import { Component, ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type { ConceptImportance, ConceptLearningMode, ConceptSummary } from "../models/conceptLibrary";
import {
	createEmptyManualConceptDraft,
	isMeaningfulManualConceptDraft,
	type ManualConceptDraft,
} from "../models/manualConceptDraft";
import type { ManualConceptDraftStore } from "../services/manualConceptDraftStore";
import type { ManualConceptInput, ManualConceptResult } from "../services/manualConceptService";
import { assessManualConceptDuplicates, type ManualConceptDuplicateAssessment } from "../services/manualConceptDuplicateCheck";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";

export const CONCEPT_COMPOSER_VIEW_TYPE = "mneme-concept-composer-view";
let sourceListId = 0;

export interface ConceptComposerOptions {
	create(input: ManualConceptInput): Promise<ManualConceptResult>;
	draftStore: ManualConceptDraftStore;
	getCurrentSourcePath(): string | undefined;
	listSourcePaths(): string[];
	onCreated(result: ManualConceptResult): Promise<void> | void;
	openConcept(path: string): Promise<void> | void;
	scanConcepts(): Promise<ConceptSummary[]>;
}

export class MnemeConceptComposerView extends ItemView {
	private acknowledgedDuplicateSignature?: string;
	private coreMeaningEl!: HTMLTextAreaElement;
	private createButtonEl!: HTMLButtonElement;
	private draft = createEmptyManualConceptDraft();
	private duplicateEl!: HTMLElement;
	private importanceEl!: HTMLSelectElement;
	private hasRendered = false;
	private isReady = false;
	private isSaving = false;
	private learningModeEl!: HTMLSelectElement;
	private readonly markdownComponent = new Component();
	private pendingDefaultSourcePath?: string;
	private saveQueue: Promise<void> = Promise.resolve();
	private saveTimer?: number;
	private sourcePathEl!: HTMLInputElement;
	private statusEl!: HTMLElement;
	private tagsEl!: HTMLInputElement;
	private titleEl!: HTMLInputElement;
	private whyItMattersEl!: HTMLTextAreaElement;

	constructor(leaf: WorkspaceLeaf, private readonly options: ConceptComposerOptions) {
		super(leaf);
	}

	getViewType(): string {
		return CONCEPT_COMPOSER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Concept Composer";
	}

	getIcon(): string {
		return "file-plus";
	}

	protected async onOpen(): Promise<void> {
		this.contentEl.addClass("mneme-review-view", "mneme-concept-composer-view");
		this.markdownComponent.load();

		try {
			const stored = await this.options.draftStore.getDraft();
			this.draft = stored ?? createEmptyManualConceptDraft(this.pendingDefaultSourcePath);
		} catch (error) {
			console.error("Mneme: failed to load Concept Composer draft", error);
			this.draft = createEmptyManualConceptDraft(this.pendingDefaultSourcePath);
		}

		this.render();
		this.isReady = true;
	}

	protected async onClose(): Promise<void> {
		if (this.isReady) {
			try {
				await this.flushDraft();
			} catch (error) {
				console.error("Mneme: failed to save Concept Composer draft", error);
			}
		}
		this.markdownComponent.unload();
		this.contentEl.empty();
		this.isReady = false;
		this.hasRendered = false;
	}

	async prepare(defaultSourcePath?: string): Promise<void> {
		this.pendingDefaultSourcePath = defaultSourcePath;
		if (!this.isReady || !defaultSourcePath || isMeaningfulManualConceptDraft(this.readDraft())) return;

		this.sourcePathEl.value = defaultSourcePath;
		await this.persistCurrentDraft();
	}

	private render(): void {
		this.contentEl.empty();
		const headerEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-header" });
		headerEl.createEl("h2", { cls: "mneme-review-title", text: "Create Concept" });
		headerEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Write the durable idea while keeping the Source Note visible.",
		});

		const formEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-form" });
		this.renderSourceField(formEl);
		this.titleEl = this.createInput(formEl, "Title", "e.g. Information Gain", this.draft.title);
		this.coreMeaningEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Core Meaning",
			parentEl: formEl,
			placeholder: "Explain the idea in your own words.",
			sourcePath: "",
			value: this.draft.coreMeaning,
		});
		this.whyItMattersEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Why It Matters",
			parentEl: formEl,
			placeholder: "Optional",
			sourcePath: "",
			value: this.draft.whyItMatters,
		});

		this.learningModeEl = this.createSelect(formEl, "Learning Mode", [
			["reviewable", "Reviewable"],
			["exploratory", "Exploratory"],
		], this.draft.learningMode);
		this.importanceEl = this.createSelect(formEl, "Importance", [
			["low", "Low"],
			["normal", "Normal"],
			["high", "High"],
			["critical", "Critical"],
		], this.draft.importance);
		this.tagsEl = this.createInput(formEl, "Tags", "Comma-separated", this.draft.tags.join(", "));

		this.duplicateEl = formEl.createDiv({ cls: "mneme-concept-composer-duplicates" });
		this.statusEl = formEl.createDiv({ cls: "mneme-review-status mneme-concept-composer-status" });
		const actionsEl = formEl.createDiv({ cls: "mneme-concept-composer-actions" });
		this.createButtonEl = actionsEl.createEl("button", { cls: "mod-cta", text: "Create Concept" });
		this.createButtonEl.addEventListener("click", () => void this.createConcept());
		formEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
			event.preventDefault();
			void this.createConcept();
		});

		for (const element of [
			this.sourcePathEl,
			this.titleEl,
			this.coreMeaningEl,
			this.whyItMattersEl,
			this.learningModeEl,
			this.importanceEl,
			this.tagsEl,
		]) {
			element.addEventListener("input", () => this.onDraftChanged());
			element.addEventListener("change", () => this.onDraftChanged());
		}
		this.hasRendered = true;
	}

	private renderSourceField(parentEl: HTMLElement): void {
		const fieldEl = parentEl.createDiv({ cls: "mneme-proposal-detail-field mneme-concept-composer-source" });
		fieldEl.createEl("label", { text: "Source Note" });
		const sourceRowEl = fieldEl.createDiv({ cls: "mneme-concept-composer-source-row" });
		const listId = `mneme-concept-source-paths-${sourceListId += 1}`;
		this.sourcePathEl = sourceRowEl.createEl("input", {
			attr: {
				list: listId,
				placeholder: "None",
				type: "text",
			},
		});
		this.sourcePathEl.value = this.draft.sourcePath ?? "";
		const dataListEl = sourceRowEl.createEl("datalist", { attr: { id: listId } });
		for (const path of this.options.listSourcePaths()) {
			dataListEl.createEl("option", { value: path });
		}

		const buttonsEl = fieldEl.createDiv({ cls: "mneme-concept-composer-source-actions" });
		buttonsEl.createEl("button", { text: "Use Current Note" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				const current = this.options.getCurrentSourcePath();
				if (!current) {
					new Notice("Mneme: Current file cannot be used as a Source Note.");
					return;
				}
				this.sourcePathEl.value = current;
				this.onDraftChanged();
			});
		});
		buttonsEl.createEl("button", { text: "Clear" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.sourcePathEl.value = "";
				this.onDraftChanged();
			});
		});
	}

	private createInput(parentEl: HTMLElement, label: string, placeholder: string, value: string): HTMLInputElement {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		fieldEl.createEl("span", { text: label });
		const inputEl = fieldEl.createEl("input", { attr: { placeholder, type: "text" } });
		inputEl.value = value;
		return inputEl;
	}

	private createSelect(
		parentEl: HTMLElement,
		label: string,
		options: Array<[string, string]>,
		selected: string,
	): HTMLSelectElement {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		fieldEl.createEl("span", { text: label });
		const selectEl = fieldEl.createEl("select");
		for (const [value, text] of options) {
			const optionEl = selectEl.createEl("option", { text, value });
			optionEl.selected = value === selected;
		}
		return selectEl;
	}

	private onDraftChanged(): void {
		this.acknowledgedDuplicateSignature = undefined;
		this.duplicateEl.empty();
		this.createButtonEl.setText("Create Concept");
		this.statusEl.empty();
		this.scheduleDraftSave();
	}

	private scheduleDraftSave(): void {
		if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = undefined;
			void this.persistCurrentDraft().catch((error) => {
				console.error("Mneme: failed to auto-save Concept Composer draft", error);
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
		this.saveQueue = this.saveQueue
			.catch(() => undefined)
			.then(() => isMeaningfulManualConceptDraft(draft)
				? this.options.draftStore.saveDraft(draft)
				: this.options.draftStore.clearDraft());
		return this.saveQueue;
	}

	private readDraft(): ManualConceptDraft {
		if (!this.hasRendered) return this.draft;
		const sourcePath = this.sourcePathEl.value.trim();
		return {
			coreMeaning: this.coreMeaningEl.value,
			importance: this.importanceEl.value as ConceptImportance,
			learningMode: this.learningModeEl.value as ConceptLearningMode,
			...(sourcePath ? { sourcePath } : {}),
			tags: parseTags(this.tagsEl.value),
			title: this.titleEl.value,
			updatedAt: new Date().toISOString(),
			whyItMatters: this.whyItMattersEl.value,
		};
	}

	private async createConcept(): Promise<void> {
		if (this.isSaving) return;
		const draft = this.readDraft();
		if (!draft.title.trim() || !draft.coreMeaning.trim()) {
			new Notice("Mneme: Title and Core Meaning are required.");
			return;
		}

		const sourcePath = draft.sourcePath?.trim();
		if (sourcePath && !this.options.listSourcePaths().includes(sourcePath)) {
			new Notice("Mneme: Select an existing Source Note or clear the Source Note field.");
			return;
		}

		this.isSaving = true;
		this.createButtonEl.disabled = true;
		this.createButtonEl.setText("Checking...");
		try {
			await this.flushDraft();
			const assessment = assessManualConceptDuplicates(
				draft.title,
				draft.coreMeaning,
				await this.options.scanConcepts(),
			);
			const duplicateSignature = JSON.stringify([draft.title.trim(), draft.coreMeaning.trim()]);

			if (assessment.exact) {
				this.renderDuplicates(assessment, false);
				new Notice("Mneme: A Concept with this title already exists.");
				return;
			}

			if (assessment.possible.length > 0 && this.acknowledgedDuplicateSignature !== duplicateSignature) {
				this.acknowledgedDuplicateSignature = duplicateSignature;
				this.renderDuplicates(assessment, true);
				this.createButtonEl.setText("Create Anyway");
				new Notice("Mneme: Review the possible duplicate before creating another Concept.");
				return;
			}

			this.createButtonEl.setText("Creating...");
			const result = await this.options.create({
				coreMeaning: draft.coreMeaning,
				importance: draft.importance,
				learningMode: draft.learningMode,
				...(sourcePath ? { sourcePath } : {}),
				tags: draft.tags,
				title: draft.title,
				whyItMatters: draft.whyItMatters,
			});
			this.resetAfterCreate(sourcePath);
			try {
				await this.persistCurrentDraft();
			} catch (error) {
				console.error("Mneme: Concept created but Composer draft reset could not be saved", error);
				new Notice("Mneme: Concept created, but the Composer draft could not be reset in plugin data.");
			}
			this.showCreatedResult(result);
			new Notice("Mneme: Concept created.");
			try {
				await this.options.onCreated(result);
			} catch (error) {
				console.error("Mneme: Concept created but dependent views could not refresh", error);
				new Notice("Mneme: Concept created, but Concept Library could not refresh.");
			}
		} catch (error) {
			console.error("Mneme: manual Concept creation failed", error);
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Concept could not be created."}`);
		} finally {
			this.isSaving = false;
			this.createButtonEl.disabled = false;
			if (this.createButtonEl.textContent === "Checking..." || this.createButtonEl.textContent === "Creating...") {
				this.createButtonEl.setText(this.acknowledgedDuplicateSignature ? "Create Anyway" : "Create Concept");
			}
		}
	}

	private renderDuplicates(assessment: ManualConceptDuplicateAssessment, allowCreateAnyway: boolean): void {
		this.duplicateEl.empty();
		const matches = assessment.exact
			? [{ concept: assessment.exact, reasons: ["Same normalized title"], score: 1 }]
			: assessment.possible;
		this.duplicateEl.createEl("strong", { text: assessment.exact ? "Concept already exists" : "Possible Duplicate" });
		for (const match of matches) {
			const rowEl = this.duplicateEl.createDiv({ cls: "mneme-concept-composer-duplicate" });
			const textEl = rowEl.createDiv();
			textEl.createEl("span", { text: match.concept.title });
			textEl.createEl("small", { text: match.reasons.join(" · ") });
			rowEl.createEl("button", { text: "Open Existing" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => void this.options.openConcept(match.concept.path));
			});
		}
		this.statusEl.setText(allowCreateAnyway
			? "Review the existing Concept. Create Anyway remains available if this is genuinely distinct."
			: "Open the existing Concept instead of creating a duplicate.");
	}

	private resetAfterCreate(sourcePath?: string): void {
		this.titleEl.value = "";
		this.coreMeaningEl.value = "";
		this.whyItMattersEl.value = "";
		this.coreMeaningEl.dispatchEvent(new Event("input"));
		this.whyItMattersEl.dispatchEvent(new Event("input"));
		this.tagsEl.value = "";
		this.learningModeEl.value = "reviewable";
		this.importanceEl.value = "normal";
		this.sourcePathEl.value = sourcePath ?? "";
		this.duplicateEl.empty();
		this.acknowledgedDuplicateSignature = undefined;
		this.createButtonEl.setText("Create Concept");
	}

	private showCreatedResult(result: ManualConceptResult): void {
		this.statusEl.empty();
		const rowEl = this.statusEl.createDiv({ cls: "mneme-concept-composer-created" });
		rowEl.createEl("span", { text: "Concept created." });
		rowEl.createEl("button", { text: "Open Concept Markdown" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.options.openConcept(result.path));
		});
	}
}

function parseTags(value: string): string[] {
	return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}
