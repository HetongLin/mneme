import { App, Component, Modal, Notice, TFile } from "obsidian";
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
import {
	formatRetentionTarget,
	MAX_CONCEPT_RETENTION_TARGET,
	MIN_CONCEPT_RETENTION_TARGET,
	parseConceptRetentionTarget,
} from "../services/conceptRetentionPolicy";
import { extractCoreMeaning, extractWhyItMatters } from "../services/conceptMarkdownParser";
import { updateConceptSections } from "../services/conceptSectionUpdater";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";
import { formatUserFacingError } from "../utils/userFacingError";

export interface ConceptEditModalOptions {
	concept: ConceptSummary;
	globalRetentionTarget?: number;
	onSaved(): Promise<void> | void;
}

export class ConceptEditModal extends Modal {
	private baseline?: ConceptEditBaseline;
	private isSaving = false;
	private readonly markdownComponent = new Component();

	constructor(app: App, private readonly options: ConceptEditModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.markdownComponent.load();
		this.titleEl.setText("View Concept");
		void this.loadAndRender();
	}

	onClose(): void {
		this.markdownComponent.unload();
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
				retentionTarget: metadata.retentionTarget,
				tags: metadata.tags,
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
		const retentionTargetInput = this.createRetentionTargetInput(contentEl, baseline.retentionTarget);
		const tagsInput = this.createTextInput(
			contentEl,
			"Tags",
			(baseline.tags ?? []).join(", "),
			"Comma-separated, e.g. machine-learning, statistics",
		);
		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", { text: "Save Concept" });

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => {
			const retentionTarget = parseConceptRetentionTarget(retentionTargetInput.value);
			if (retentionTargetInput.value.trim().length > 0 && retentionTarget === undefined) {
				new Notice("Mneme: Retention Target must be between 0.70 and 0.98.");
				return;
			}
			void this.save({
				coreMeaning: coreMeaningInput.value,
				importance: parseImportance(importanceSelect.value),
				learningMode: parseLearningMode(learningModeSelect.value),
				retentionTarget,
				tags: parseTags(tagsInput.value),
				whyItMatters: whyInput.value,
			}, saveButton);
		});
	}

	private createTextInput(parentEl: HTMLElement, label: string, value: string, placeholder: string): HTMLInputElement {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const input = labelEl.createEl("input", {
			attr: {
				placeholder,
				spellcheck: "false",
				type: "text",
			},
		});
		input.value = value;

		return input;
	}

	private createRetentionTargetInput(parentEl: HTMLElement, value: number | undefined): HTMLInputElement {
		const globalTarget = this.options.globalRetentionTarget ?? 0.9;
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "Retention Target" });
		const input = labelEl.createEl("input", {
			attr: {
				max: String(MAX_CONCEPT_RETENTION_TARGET),
				min: String(MIN_CONCEPT_RETENTION_TARGET),
				placeholder: `Global ${formatRetentionTarget(globalTarget)}`,
				step: "0.01",
				type: "number",
			},
		});
		input.value = value === undefined ? "" : formatRetentionTarget(value);
		labelEl.createEl("small", {
			text: "Optional FSRS policy for future ratings. Blank uses the global target; existing due dates stay unchanged.",
		});

		return input;
	}

	private createTextarea(parentEl: HTMLElement, label: string, value: string): HTMLTextAreaElement {
		return createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label,
			parentEl,
			sourcePath: this.options.concept.path,
			value,
		});
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
				retentionTarget: next.retentionTarget ?? null,
				tags: next.tags,
			});

			if (updatedMarkdown !== currentMarkdown) {
				await this.app.vault.modify(file, updatedMarkdown);
			}

			try {
				await this.options.onSaved();
			} catch (error) {
				console.error("Mneme: Concept saved but dependent views could not refresh", error);
				new Notice(`Mneme: Concept saved, but view refresh failed: ${formatUserFacingError(error, "Reopen Concept Library.")}`);
				this.close();
				return;
			}
			new Notice("Mneme: Concept updated.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to edit Concept", {
				error,
				path: this.options.concept.path,
			});
			new Notice(`Mneme: Concept could not be updated: ${formatUserFacingError(error, "Try again.")}`);
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

function parseTags(value: string): string[] {
	return [...new Set(value
		.split(",")
		.map((tag) => tag.trim().replace(/^#+/, "").toLocaleLowerCase().replace(/\s+/g, "-"))
		.filter((tag) => tag.length > 0))];
}
