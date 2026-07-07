import { App, Modal, Notice, TFile } from "obsidian";
import type {
	ConceptImportance,
	ConceptLearningMode,
	ConceptSummary,
} from "../models/conceptLibrary";
import {
	readConceptEditableMetadata,
	updateConceptMetadata,
} from "../services/conceptMetadataUpdater";
import {
	ConceptEditBaseline,
	hasTargetedConceptEditConflict,
} from "../services/conceptEditConflict";
import { extractCoreMeaning, extractWhyItMatters } from "../services/conceptMarkdownParser";
import { updateConceptSections } from "../services/conceptSectionUpdater";

export interface ConceptEditModalOptions {
	concept: ConceptSummary;
	onSaved(): Promise<void> | void;
}

export class ConceptEditModal extends Modal {
	private baseline?: ConceptEditBaseline;
	private isSaving = false;

	constructor(app: App, private readonly options: ConceptEditModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Edit Concept");
		void this.loadAndRender();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadAndRender(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: "Loading Concept...",
		});

		try {
			const file = this.getConceptFile();
			const markdown = await this.app.vault.cachedRead(file);
			const metadata = readConceptEditableMetadata(markdown);
			this.baseline = {
				coreMeaning: extractCoreMeaning(markdown) ?? "",
				importance: metadata.importance,
				learningMode: metadata.learningMode,
				whyItMatters: extractWhyItMatters(markdown) ?? "",
			};
			this.renderEditor(this.baseline);
		} catch (error) {
			console.error("Mneme: failed to load Concept editor", error);
			this.contentEl.empty();
			this.contentEl.createEl("p", {
				cls: "mneme-review-error",
				text: "Concept could not be loaded.",
			});
		}
	}

	private renderEditor(baseline: ConceptEditBaseline): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mneme-concept-edit-modal");
		contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Editing ${this.options.concept.path}`,
		});
		const coreMeaningInput = this.createTextarea(contentEl, "Core Meaning", baseline.coreMeaning);
		const whyInput = this.createTextarea(contentEl, "Why It Matters", baseline.whyItMatters);
		const learningModeSelect = this.createSelect<ConceptLearningMode>(
			contentEl,
			"Learning Mode",
			baseline.learningMode,
			[["reviewable", "Reviewable"], ["exploratory", "Exploratory"]],
		);
		const importanceSelect = this.createSelect<ConceptImportance>(
			contentEl,
			"Importance",
			baseline.importance,
			[["low", "Low"], ["normal", "Normal"], ["high", "High"], ["critical", "Critical"]],
		);
		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", { text: "Save Concept" });

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => {
			void this.save({
				coreMeaning: coreMeaningInput.value,
				importance: parseImportance(importanceSelect.value),
				learningMode: parseLearningMode(learningModeSelect.value),
				whyItMatters: whyInput.value,
			}, saveButton);
		});
	}

	private createTextarea(parentEl: HTMLElement, label: string, value: string): HTMLTextAreaElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const textarea = labelEl.createEl("textarea", {
			attr: { spellcheck: "true" },
			cls: "mneme-proposal-detail-field-textarea",
		});
		textarea.value = value;

		return textarea;
	}

	private createSelect<T extends string>(
		parentEl: HTMLElement,
		label: string,
		value: T | undefined,
		options: Array<[T, string]>,
	): HTMLSelectElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const select = labelEl.createEl("select");
		select.createEl("option", { text: "Unspecified", value: "" });

		for (const [optionValue, optionLabel] of options) {
			const option = select.createEl("option", { text: optionLabel, value: optionValue });
			option.selected = optionValue === value;
		}

		return select;
	}

	private async save(next: ConceptEditBaseline, saveButton: HTMLButtonElement): Promise<void> {
		if (this.isSaving || !this.baseline) {
			return;
		}

		if (!next.coreMeaning.trim()) {
			new Notice("Mneme: Core Meaning cannot be empty.");
			return;
		}

		this.isSaving = true;
		saveButton.disabled = true;

		try {
			const file = this.getConceptFile();
			const currentMarkdown = await this.app.vault.cachedRead(file);

			if (hasTargetedConceptEditConflict(this.baseline, currentMarkdown)) {
				new Notice("Mneme: Concept changed while the editor was open. Reopen it to review the latest text.");
				return;
			}

			let updatedMarkdown = updateConceptSections(currentMarkdown, {
				coreMeaning: next.coreMeaning,
				whyItMatters: next.whyItMatters,
			}).markdown;
			updatedMarkdown = updateConceptMetadata(updatedMarkdown, {
				importance: next.importance ?? null,
				learningMode: next.learningMode ?? null,
			});

			if (updatedMarkdown !== currentMarkdown) {
				await this.app.vault.modify(file, updatedMarkdown);
			}

			await this.options.onSaved();
			new Notice("Mneme: Concept updated.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to edit Concept", {
				error,
				path: this.options.concept.path,
			});
			new Notice("Mneme: Concept could not be updated. See console.");
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}

	private getConceptFile(): TFile {
		const file = this.app.vault.getAbstractFileByPath(this.options.concept.path);

		if (!(file instanceof TFile)) {
			throw new Error(`Concept file not found: ${this.options.concept.path}`);
		}

		return file;
	}
}

function parseImportance(value: string): ConceptImportance | undefined {
	return value === "low" || value === "normal" || value === "high" || value === "critical"
		? value
		: undefined;
}

function parseLearningMode(value: string): ConceptLearningMode | undefined {
	return value === "reviewable" || value === "exploratory" ? value : undefined;
}
