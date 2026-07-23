import { App, Modal, Notice } from "obsidian";
import type { ConceptSummary } from "../models/conceptLibrary";
import { formatUserFacingError } from "../utils/userFacingError";

export interface ConceptDeleteModalOptions {
	concept: ConceptSummary;
	onConfirmed(): Promise<void> | void;
}

export class ConceptDeleteModal extends Modal {
	private isDeleting = false;

	constructor(app: App, private readonly options: ConceptDeleteModalOptions) {
		super(app);
	}

	onOpen(): void {
		const cardCount = this.options.concept.cardCount ?? 0;
		this.titleEl.setText("Delete Concept");
		this.contentEl.createEl("p", { text: `Concept: ${this.options.concept.title}` });
		this.contentEl.createEl("p", {
			text: cardCount > 0
				? `This deletes the Concept Markdown and its Cards Markdown (${cardCount} ${cardCount === 1 ? "Card" : "Cards"}). Related Concept links are removed. Source Notes are not deleted.`
				: "This deletes the Concept Markdown and removes Related Concept links. Source Notes are not deleted.",
		});
		this.contentEl.createEl("p", {
			cls: "mneme-review-error",
			text: "This action cannot be undone from Mneme.",
		});

		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const deleteButton = actionsEl.createEl("button", { cls: "mod-warning", text: "Delete Concept" });
		cancelButton.addEventListener("click", () => this.close());
		deleteButton.addEventListener("click", () => void this.delete(deleteButton));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async delete(deleteButton: HTMLButtonElement): Promise<void> {
		if (this.isDeleting) return;
		this.isDeleting = true;
		deleteButton.disabled = true;

		try {
			await this.options.onConfirmed();
			new Notice("Mneme: Concept deleted.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to delete Concept", {
				conceptId: this.options.concept.conceptId,
				error,
			});
			new Notice(`Mneme: Concept could not be deleted: ${formatUserFacingError(error, "Try again.")}`);
		} finally {
			this.isDeleting = false;
			deleteButton.disabled = false;
		}
	}
}
