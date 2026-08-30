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
import { buildConceptTagCatalog, type ConceptTagCatalogEntry } from "../services/conceptTagCatalog";
import { createConceptTagPicker, type ConceptTagPicker } from "../ui/conceptTagPicker";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";
import type {
	ConceptNameConflict,
	ConceptNameConflictResolution,
} from "../services/conceptNameConflict";
import { chooseConceptNameConflictResolution } from "../modals/conceptNameConflictModal";
import { shouldOfferEnglishAlias } from "../services/conceptNaming";

export const CONCEPT_COMPOSER_VIEW_TYPE = "mneme-concept-composer-view";
let sourceListId = 0;

export interface ConceptComposerOptions {
	canSuggestEnglishName(): boolean;
	create(input: ManualConceptInput): Promise<ManualConceptResult>;
	discardMergeDraft(key: string): Promise<void> | void;
	draftStore: ManualConceptDraftStore;
	englishAliasesEnabled(): boolean;
	findNameConflict(input: Pick<ManualConceptInput, "coreMeaning" | "englishName" | "title">): Promise<ConceptNameConflict | undefined>;
	getCurrentSourcePath(): string | undefined;
	listSourcePaths(): string[];
	onCreated(result: ManualConceptResult): Promise<void> | void;
	openMerge(
		existing: ConceptSummary,
		draft: ManualConceptDraft,
		onReturn: () => Promise<void>,
	): Promise<void> | void;
	openConceptMarkdown(path: string): Promise<void> | void;
	scanConcepts(): Promise<ConceptSummary[]>;
	suggestEnglishName(title: string, coreMeaning: string): Promise<{ englishName: string }>;
	viewConcept(result: ManualConceptResult): Promise<void> | void;
}

export class MnemeConceptComposerView extends ItemView {
	private acknowledgedDuplicateSignature?: string;
	private coreMeaningEl!: HTMLTextAreaElement;
	private createButtonEl!: HTMLButtonElement;
	private createdResultEl!: HTMLElement;
	private draft = createEmptyManualConceptDraft();
	private duplicateEl!: HTMLElement;
	private englishNameAssistEl!: HTMLElement;
	private englishNameButtonEl!: HTMLButtonElement;
	private englishNameEl!: HTMLInputElement;
	private englishNameFieldEl!: HTMLElement;
	private englishNameRequest = 0;
	private importanceEl!: HTMLSelectElement;
	private hasRendered = false;
	private isReady = false;
	private isSaving = false;
	private lastObservedTitle = "";
	private learningModeEl!: HTMLSelectElement;
	private readonly markdownComponent = new Component();
	private pendingDefaultSourcePath?: string;
	private saveQueue: Promise<void> = Promise.resolve();
	private saveTimer?: number;
	private sourcePathEl!: HTMLInputElement;
	private statusEl!: HTMLElement;
	private tagCatalog: ConceptTagCatalogEntry[] = [];
	private tagPicker!: ConceptTagPicker;
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
		await this.refreshTagCatalog();

		this.render();
		this.isReady = true;
	}

	protected async onClose(): Promise<void> {
		this.englishNameRequest += 1;
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
		if (!this.isReady) return;
		await this.refreshTagCatalog();
		if (!defaultSourcePath || isMeaningfulManualConceptDraft(this.readDraft())) return;

		this.sourcePathEl.value = defaultSourcePath;
		await this.persistCurrentDraft();
	}

	async completeConflictMerge(): Promise<void> {
		const sourcePath = this.readDraft().sourcePath?.trim();
		this.resetAfterCreate(sourcePath);
		await this.persistCurrentDraft();
		this.statusEl.setText("Merged into the existing Concept. Ready to create another Concept.");
	}

	private render(): void {
		this.contentEl.empty();
		const headerEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-header" });
		headerEl.createEl("h2", { cls: "mneme-review-title", text: "Create Concept" });
		headerEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Write the durable idea while keeping the Source Note visible.",
		});
		this.createdResultEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-created-result" });

		const formEl = this.contentEl.createDiv({ cls: "mneme-concept-composer-form" });
		this.renderSourceField(formEl);
		this.titleEl = this.createInput(formEl, "Title", "e.g. Information Gain", this.draft.title);
		this.titleEl.addClass("mneme-concept-title-input");
		this.coreMeaningEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Core Meaning",
			parentEl: formEl,
			placeholder: "What is this Concept, and how does it work?",
			sourcePath: "",
			value: this.draft.coreMeaning,
		});
		this.whyItMattersEl = createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label: "Why It Matters (optional)",
			parentEl: formEl,
			placeholder: "Why is it useful, important, or worth remembering?",
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
		this.tagPicker = createConceptTagPicker({
			catalog: this.tagCatalog,
			contextProvider: () => `${this.titleEl.value}\n${this.coreMeaningEl.value}`,
			initialTags: this.draft.tags,
			onChange: () => this.onDraftChanged(),
			parentEl: formEl,
		});
		this.renderEnglishNameField(formEl);

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

		this.titleEl.addEventListener("input", () => {
			this.tagPicker.refresh();
			this.onTitleChanged();
		});
		this.titleEl.addEventListener("change", () => this.onTitleChanged());
		this.englishNameEl.addEventListener("input", () => {
			this.onDraftChanged();
		});
		this.englishNameEl.addEventListener("change", () => this.onDraftChanged());

		for (const element of [
			this.sourcePathEl,
			this.coreMeaningEl,
			this.whyItMattersEl,
			this.learningModeEl,
			this.importanceEl,
		]) {
			element.addEventListener("input", () => {
				if (element === this.coreMeaningEl) this.tagPicker.refresh();
				if (element === this.coreMeaningEl) this.updateEnglishNameUi();
				this.onDraftChanged();
			});
			element.addEventListener("change", () => this.onDraftChanged());
		}
		this.hasRendered = true;
		this.lastObservedTitle = this.titleEl.value.trim();
		this.updateEnglishNameUi();
	}

	private renderEnglishNameField(parentEl: HTMLElement): void {
		this.englishNameFieldEl = parentEl.createEl("label", {
			cls: "mneme-proposal-detail-field mneme-concept-composer-english-name",
		});
		this.englishNameFieldEl.createEl("span", { text: "English Alias (optional)" });
		const rowEl = this.englishNameFieldEl.createDiv({
			cls: "mneme-concept-composer-english-name-row",
		});
		this.englishNameEl = rowEl.createEl("input", {
			attr: {
				placeholder: "Canonical English alias",
				type: "text",
			},
		});
		this.englishNameEl.value = this.options.englishAliasesEnabled() && shouldOfferEnglishAlias(this.draft.title)
			? this.draft.englishName
			: "";
		this.englishNameButtonEl = rowEl.createEl("button", {
			attr: { type: "button" },
			text: "Generate with AI",
		});
		this.englishNameButtonEl.addEventListener("click", () => void this.generateEnglishName());
		this.englishNameAssistEl = this.englishNameFieldEl.createEl("small", {
			text: "Optional display alias for a non-English Title. It never controls Concept identity.",
		});
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
		this.createdResultEl.empty();
		this.acknowledgedDuplicateSignature = undefined;
		this.duplicateEl.empty();
		this.createButtonEl.setText("Create Concept");
		this.statusEl.empty();
		this.scheduleDraftSave();
	}

	private onTitleChanged(): void {
		const title = this.titleEl.value.trim();
		if (title === this.lastObservedTitle) {
			this.updateEnglishNameUi();
			return;
		}
		this.lastObservedTitle = title;
		// An alias describes the current Title, so clear it when that Title changes.
		this.englishNameEl.value = "";
		this.englishNameRequest += 1;
		this.updateEnglishNameUi();
		this.onDraftChanged();
	}

	private async generateEnglishName(): Promise<void> {
		const title = this.titleEl.value.trim();
		const coreMeaning = this.coreMeaningEl.value.trim();
		if (!title || !coreMeaning) {
			new Notice("Mneme: Complete Title and Core Meaning before generating an English Alias.");
			return;
		}
		if (!this.options.canSuggestEnglishName()) {
			new Notice("Mneme: Enable English Alias suggestions and configure AI capture, or enter the alias manually.");
			return;
		}

		const request = this.englishNameRequest += 1;
		this.englishNameButtonEl.disabled = true;
		this.englishNameButtonEl.setText("Generating...");
		this.englishNameAssistEl.setText("Generating a canonical English Alias from Title and Core Meaning…");
		try {
			const suggestion = await this.options.suggestEnglishName(title, coreMeaning);
			if (
				request !== this.englishNameRequest
				|| title !== this.titleEl.value.trim()
				|| coreMeaning !== this.coreMeaningEl.value.trim()
			) return;
			this.englishNameEl.value = suggestion.englishName;
			this.englishNameAssistEl.setText("AI suggestion. Review or edit it before creating the Concept.");
			this.createdResultEl.empty();
			this.acknowledgedDuplicateSignature = undefined;
			this.duplicateEl.empty();
			this.createButtonEl.setText("Create Concept");
			this.statusEl.empty();
			this.scheduleDraftSave();
		} catch (error) {
			if (request !== this.englishNameRequest) return;
			console.error("Mneme: English Alias generation failed", error);
			this.englishNameAssistEl.setText("AI generation failed. Enter the English Alias manually or try again.");
			new Notice(`Mneme: ${error instanceof Error ? error.message : "English Alias could not be generated."}`);
		} finally {
			if (request === this.englishNameRequest) {
				this.englishNameButtonEl.setText("Generate with AI");
				this.updateEnglishNameUi(false);
			}
		}
	}

	private updateEnglishNameUi(resetHelp = true): void {
		const title = this.titleEl.value.trim();
		const shouldShow = this.options.englishAliasesEnabled()
			&& !!title
			&& shouldOfferEnglishAlias(title);
		this.englishNameFieldEl.toggleClass("is-hidden", !shouldShow);
		if (!shouldShow) return;
		const canGenerate = !!this.coreMeaningEl.value.trim() && this.options.canSuggestEnglishName();
		this.englishNameButtonEl.disabled = !canGenerate || this.englishNameButtonEl.textContent === "Generating...";
		if (!resetHelp) return;
		if (!this.options.canSuggestEnglishName()) {
			this.englishNameAssistEl.setText(
				"Optional English display alias. Enable AI capture to generate a suggestion, or enter it manually.",
			);
		} else if (!this.coreMeaningEl.value.trim()) {
			this.englishNameAssistEl.setText(
				"Optional English display alias. Complete Core Meaning to enable AI generation, or enter it manually.",
			);
		} else {
			this.englishNameAssistEl.setText(
				"Optional English display alias. It never controls Concept identity.",
			);
		}
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
		const title = this.titleEl.value;
		return {
			coreMeaning: this.coreMeaningEl.value,
			englishName: this.options.englishAliasesEnabled() && shouldOfferEnglishAlias(title)
				? this.englishNameEl.value
				: "",
			importance: this.importanceEl.value as ConceptImportance,
			learningMode: this.learningModeEl.value as ConceptLearningMode,
			...(sourcePath ? { sourcePath } : {}),
			tags: this.tagPicker.getTags(),
			title,
			updatedAt: new Date().toISOString(),
			whyItMatters: this.whyItMattersEl.value,
		};
	}

	private async createConcept(
		resolvedConflict?: {
			conflict: ConceptNameConflict;
			resolution: ConceptNameConflictResolution;
		},
	): Promise<void> {
		if (this.isSaving) return;
		let draft = this.readDraft();
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
			draft = this.draft;
			const nameConflict = resolvedConflict?.conflict ?? await this.options.findNameConflict({
					coreMeaning: draft.coreMeaning,
					englishName: draft.englishName,
					title: draft.title,
				});
			let conflictResolution = resolvedConflict?.resolution;
			if (nameConflict) {
				conflictResolution ??= await chooseConceptNameConflictResolution(this.app, nameConflict);
				if (conflictResolution === "refine_name") {
					await this.options.discardMergeDraft("manual");
					this.focusTitleForRefinement();
					return;
				}
				if (conflictResolution === "cancel") {
					return;
				}
				if (conflictResolution === "merge") {
					await this.options.openMerge(
						nameConflict.existing,
						draft,
						() => this.returnToConflictOptions(nameConflict),
					);
					new Notice("Mneme: Review the Merge draft. Your Create Concept draft remains saved.");
					return;
				}
				await this.options.discardMergeDraft("manual");
			}
			const assessment = assessManualConceptDuplicates(
				draft.title,
				draft.coreMeaning,
				await this.options.scanConcepts(),
			);
			const duplicateSignature = JSON.stringify([draft.title.trim(), draft.coreMeaning.trim()]);

			if (
				!nameConflict
				&& assessment.possible.length > 0
				&& this.acknowledgedDuplicateSignature !== duplicateSignature
			) {
				this.acknowledgedDuplicateSignature = duplicateSignature;
				this.renderDuplicates(assessment, true);
				this.createButtonEl.setText("Create Anyway");
				new Notice("Mneme: Review the possible duplicate before creating another Concept.");
				return;
			}

			this.createButtonEl.setText("Creating...");
			const result = await this.options.create({
				coreMeaning: draft.coreMeaning,
				englishName: draft.englishName,
				importance: draft.importance,
				learningMode: draft.learningMode,
				...(sourcePath ? { sourcePath } : {}),
				tags: draft.tags,
				title: draft.title,
				whyItMatters: draft.whyItMatters,
			});
			this.resetAfterCreate(sourcePath);
			await this.refreshTagCatalog();
			try {
				await this.persistCurrentDraft();
			} catch (error) {
				console.error("Mneme: Concept created but Composer draft reset could not be saved", error);
				new Notice("Mneme: Concept created, but the Composer draft could not be reset in plugin data.");
			}
			this.showCreatedResult(result, draft.title.trim());
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
			if (
				this.createButtonEl.textContent === "Checking..."
				|| this.createButtonEl.textContent === "Creating..."
			) {
				this.createButtonEl.setText(this.acknowledgedDuplicateSignature ? "Create Anyway" : "Create Concept");
			}
		}
	}

	private async returnToConflictOptions(conflict: ConceptNameConflict): Promise<void> {
		await this.app.workspace.revealLeaf(this.leaf);
		const resolution = await chooseConceptNameConflictResolution(this.app, conflict);
		if (resolution === "refine_name") {
			await this.options.discardMergeDraft("manual");
			this.focusTitleForRefinement();
			return;
		}
		if (resolution === "cancel") return;
		if (resolution === "merge") {
			await this.flushDraft();
			await this.options.openMerge(
				conflict.existing,
				this.draft,
				() => this.returnToConflictOptions(conflict),
			);
			return;
		}
		await this.options.discardMergeDraft("manual");
		await this.createConcept({ conflict, resolution });
	}

	private focusTitleForRefinement(): void {
		this.titleEl.focus();
		this.titleEl.select();
		this.titleEl.scrollIntoView({ behavior: "smooth", block: "center" });
		this.statusEl.setText(
			"Refine the Title to distinguish this Concept. Changing it clears the optional English Alias.",
		);
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
				buttonEl.addEventListener("click", () => void this.options.openConceptMarkdown(match.concept.path));
			});
		}
		this.statusEl.setText(allowCreateAnyway
			? "Review the existing Concept. Create Anyway remains available if this is genuinely distinct."
			: "Open the existing Concept instead of creating a duplicate.");
	}

	private resetAfterCreate(sourcePath?: string): void {
		this.titleEl.value = "";
		this.lastObservedTitle = "";
		this.englishNameEl.value = "";
		this.englishNameRequest += 1;
		this.coreMeaningEl.value = "";
		this.whyItMattersEl.value = "";
		this.coreMeaningEl.dispatchEvent(new Event("input"));
		this.whyItMattersEl.dispatchEvent(new Event("input"));
		this.tagPicker.setTags([], false);
		this.learningModeEl.value = "reviewable";
		this.importanceEl.value = "normal";
		this.sourcePathEl.value = sourcePath ?? "";
		this.updateEnglishNameUi();
		this.duplicateEl.empty();
		this.acknowledgedDuplicateSignature = undefined;
		this.createButtonEl.setText("Create Concept");
	}

	private showCreatedResult(result: ManualConceptResult, title: string): void {
		this.createdResultEl.empty();
		const rowEl = this.createdResultEl.createDiv({ cls: "mneme-concept-composer-created" });
		const messageEl = rowEl.createDiv({ cls: "mneme-concept-composer-created-message" });
		messageEl.createEl("strong", { text: `Created: ${title}` });
		messageEl.createEl("span", { text: "Ready to create another Concept." });
		const actionsEl = rowEl.createDiv({ cls: "mneme-concept-composer-created-actions" });
		actionsEl.createEl("button", { cls: "mod-cta", text: "View Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.options.viewConcept(result));
		});
		actionsEl.createEl("button", { text: "Open Concept Markdown" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.options.openConceptMarkdown(result.path));
		});
		this.contentEl.scrollTo({ behavior: "smooth", top: 0 });
	}

	private async refreshTagCatalog(): Promise<void> {
		try {
			this.tagCatalog = buildConceptTagCatalog(await this.options.scanConcepts());
			if (this.hasRendered) this.tagPicker.setCatalog(this.tagCatalog);
		} catch (error) {
			console.error("Mneme: failed to load existing Concept tags", error);
			if (!this.hasRendered) this.tagCatalog = [];
		}
	}
}
