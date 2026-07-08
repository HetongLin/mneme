import { App, Modal, Notice, TFile } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";
import { assignCardId, createStableCardId } from "../services/cardIdEditor";

export interface CardIdRepairModalOptions {
	card: LoadedMnemeCard;
	existingCardIds: Set<string>;
	onSaved(oldCardId: string, newCardId: string, migrateState: boolean): Promise<void> | void;
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
			const { card } = this.options;
			if (this.options.existingCardIds.has(newCardId)) {
				new Notice("Mneme: That Card ID already exists in the vault.");
				return;
			}

			const abstractFile = this.app.vault.getAbstractFileByPath(card.path);
			if (!(abstractFile instanceof TFile)) {
				new Notice("Mneme: Card.md was not found.");
				return;
			}

			const currentMarkdown = await this.app.vault.cachedRead(abstractFile);
			const result = assignCardId(currentMarkdown, {
				cardBlockIndex: card.cardIndex,
				expectedBack: card.back,
				expectedCardId: card.hasExplicitCardId ? card.cardId : undefined,
				expectedFront: card.front,
				newCardId,
			});

			if (result.status !== "updated") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}

			await this.app.vault.modify(abstractFile, result.markdown);
			try {
				await this.options.onSaved(card.cardId, newCardId, !this.isDuplicateRepair());
			} catch (error) {
				await this.app.vault.modify(abstractFile, currentMarkdown);
				throw error;
			}

			new Notice("Mneme: Stable Card ID saved.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to repair Card ID", {
				error,
				path: this.options.card.path,
			});
			new Notice("Mneme: Card ID could not be repaired. See console.");
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}

	private isDuplicateRepair(): boolean {
		return this.options.card.errors.some((error) => error.startsWith("Duplicate card id:"));
	}
}
