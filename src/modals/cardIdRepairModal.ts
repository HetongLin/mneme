import { App, Modal, Notice } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";
import { createStableCardId } from "../services/cardIdEditor";

export interface CardIdRepairModalOptions {
	card: LoadedMnemeCard;
	existingCardIds: Set<string>;
	onConfirmed(newCardId: string): Promise<void> | void;
	onSaved(): Promise<void> | void;
}

export class CardIdRepairModal extends Modal {
	private isSaving = false;

	constructor(app: App, private readonly options: CardIdRepairModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.isDuplicateRepair() ? "Replace Duplicate Card ID" : "Assign Stable Card ID");
		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { card } = this.options;
		const duplicate = this.isDuplicateRepair();
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: `Card: ${card.path} · block ${card.cardIndex + 1}` });
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: duplicate
				? "This block will receive a new identity. Shared duplicate-ID review state stays with the original ID."
				: "Fallback review state and queue controls will move to the new stable ID.",
		});
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "New Card ID" });
		const input = labelEl.createEl("input", {
			attr: { spellcheck: "false", type: "text" },
			cls: "mneme-proposal-detail-field-input",
		});
		input.value = createStableCardId();
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", {
			text: duplicate ? "Replace ID" : "Assign ID",
		});

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => {
			void this.save(input.value, saveButton);
		});
	}

	private async save(newCardIdValue: string, saveButton: HTMLButtonElement): Promise<void> {
		if (this.isSaving) {
			return;
		}

		this.isSaving = true;
		saveButton.disabled = true;
		const newCardId = newCardIdValue.trim();

		try {
			if (this.options.existingCardIds.has(newCardId)) {
				new Notice("Mneme: That Card ID already exists in the vault.");
				return;
			}

			await this.options.onConfirmed(newCardId);

			new Notice("Mneme: Stable Card ID saved.");
			this.close();
			try {
				await this.options.onSaved();
			} catch (error) {
				console.error("Mneme: Card ID saved but views could not refresh", error);
				new Notice("Mneme: Card ID saved. Reopen the Review View to refresh it.");
			}
		} catch (error) {
			console.error("Mneme: failed to repair Card ID", {
				error,
				path: this.options.card.path,
			});
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Card ID could not be repaired."} Run Resume Card ID Repair if a repair record was saved.`);
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}

	private isDuplicateRepair(): boolean {
		return this.options.card.errors.some((error) => error.startsWith("Duplicate card id:"));
	}
}
