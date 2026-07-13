import { App, Modal, Notice } from "obsidian";
import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import type { ManualConceptInput, ManualConceptResult } from "../services/manualConceptService";

export interface ManualConceptModalOptions {
	create(input: ManualConceptInput): Promise<ManualConceptResult>;
	onCreated(result: ManualConceptResult): Promise<void> | void;
}

export class ManualConceptModal extends Modal {
	private isSaving = false;

	constructor(app: App, private readonly options: ManualConceptModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Create Concept");
		this.renderForm();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderForm(): void {
		const title = this.createInput("Title", "e.g. Information Gain");
		const coreMeaning = this.createTextarea("Core Meaning", "Explain the idea in your own words.");
		const whyItMatters = this.createTextarea("Why It Matters", "Optional");
		const learningMode = this.createSelect("Learning Mode", [
			["reviewable", "Reviewable"],
			["exploratory", "Exploratory"],
		], "reviewable");
		const importance = this.createSelect("Importance", [
			["low", "Low"],
			["normal", "Normal"],
			["high", "High"],
			["critical", "Critical"],
		], "normal");
		const tags = this.createInput("Tags", "Comma-separated; any language is allowed");
		const actions = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancel = actions.createEl("button", { text: "Cancel" });
		const create = actions.createEl("button", { text: "Create Concept" });
		cancel.addEventListener("click", () => this.close());
		create.addEventListener("click", () => void this.save({
			coreMeaning: coreMeaning.value,
			importance: importance.value as ConceptImportance,
			learningMode: learningMode.value as ConceptLearningMode,
			tags: parseTags(tags.value),
			title: title.value,
			whyItMatters: whyItMatters.value,
		}, create));
	}

	private createInput(label: string, placeholder: string): HTMLInputElement {
		const field = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		field.createEl("span", { text: label });
		return field.createEl("input", { attr: { placeholder, type: "text" } });
	}

	private createTextarea(label: string, placeholder: string): HTMLTextAreaElement {
		const field = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		field.createEl("span", { text: label });
		return field.createEl("textarea", {
			attr: { placeholder, spellcheck: "true" },
			cls: "mneme-proposal-detail-field-textarea",
		});
	}

	private createSelect(label: string, options: Array<[string, string]>, selected: string): HTMLSelectElement {
		const field = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		field.createEl("span", { text: label });
		const select = field.createEl("select");
		for (const [value, text] of options) {
			const option = select.createEl("option", { text, value });
			option.selected = value === selected;
		}
		return select;
	}

	private async save(input: ManualConceptInput, button: HTMLButtonElement): Promise<void> {
		if (this.isSaving) return;
		if (!input.title.trim() || !input.coreMeaning.trim()) {
			new Notice("Mneme: Title and Core Meaning are required.");
			return;
		}
		this.isSaving = true;
		button.disabled = true;
		try {
			const result = await this.options.create(input);
			await this.options.onCreated(result);
			new Notice("Mneme: Concept created.");
			this.close();
		} catch (error) {
			console.error("Mneme: manual Concept creation failed", error);
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Concept could not be created."}`);
		} finally {
			this.isSaving = false;
			button.disabled = false;
		}
	}
}

function parseTags(value: string): string[] {
	return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}
