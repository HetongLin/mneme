import { App, Modal, Notice } from "obsidian";
import type { ConceptIdentityIssue } from "../models/conceptLibrary";
import { createStableConceptId } from "../services/conceptIdEditor";

export interface ConceptIdRepairModalOptions {
	existingConceptIds: Set<string>;
	issue: ConceptIdentityIssue;
	onConfirmed(newConceptId: string): Promise<void> | void;
	onSaved(): Promise<void> | void;
}

export class ConceptIdRepairModal extends Modal {
	private isSaving = false;

	constructor(app: App, private readonly options: ConceptIdRepairModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.isDuplicateRepair() ? "Replace Duplicate Concept ID" : "Assign Stable Concept ID");
		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { issue } = this.options;
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: `${issue.title} · ${issue.path}` });
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.isDuplicateRepair()
				? "This Concept and its explicitly linked Card Group receive a new identity. Shared state stays with the original ID."
				: "The linked Card Group is kept in sync. An unambiguous Concept pause is migrated when needed.",
		});
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "New Concept ID" });
		const input = labelEl.createEl("input", {
			attr: { spellcheck: "false", type: "text" },
			cls: "mneme-proposal-detail-field-input",
		});
		input.value = this.getSuggestedId();
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", {
			text: this.isDuplicateRepair() ? "Replace ID" : "Assign ID",
		});

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => void this.save(input.value, saveButton));
	}

	private async save(newConceptIdValue: string, saveButton: HTMLButtonElement): Promise<void> {
		if (this.isSaving) {
			return;
		}

		this.isSaving = true;
		saveButton.disabled = true;
		const newConceptId = newConceptIdValue.trim();

		try {
			if (this.options.existingConceptIds.has(newConceptId)) {
				new Notice("Mneme: That Concept ID already exists in the vault.");
				return;
			}

			await this.options.onConfirmed(newConceptId);

			new Notice("Mneme: Stable Concept ID saved.");
			this.close();
			try {
				await this.options.onSaved();
			} catch (error) {
				console.error("Mneme: Concept ID saved but views could not refresh", error);
				new Notice("Mneme: Concept ID saved. Reopen Concept Library to refresh it.");
			}
		} catch (error) {
			console.error("Mneme: failed to repair Concept ID", { error, path: this.options.issue.path });
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Concept ID could not be repaired."} Run Resume Concept ID Repair if a repair record was saved.`);
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}

	private getSuggestedId(): string {
		if (!this.isDuplicateRepair() && this.options.issue.cardsPath) {
			const cardConceptId = getCachedConceptId(this.app, this.options.issue.cardsPath);
			if (cardConceptId && !this.options.existingConceptIds.has(cardConceptId)) {
				return cardConceptId;
			}
		}

		return createStableConceptId();
	}

	private isDuplicateRepair(): boolean {
		return this.options.issue.kind === "duplicate_id";
	}
}

function getCachedConceptId(app: App, path: string): string | undefined {
	const value = app.metadataCache.getCache(path)?.frontmatter?.mneme_concept_id;

	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
