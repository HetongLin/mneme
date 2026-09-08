import { App, Modal, Notice } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";
import { formatUserFacingError } from "../utils/userFacingError";

export interface CardDeleteModalOptions {
	card: LoadedMnemeCard;
	onConfirmed(): Promise<void> | void;
	onDeleted(cardId: string): Promise<void> | void;
}

export class CardDeleteModal extends Modal {
	private isDeleting = false;

	constructor(app: App, private readonly options: CardDeleteModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Delete Card");
		this.contentEl.createEl("p", { text: `Card: ${this.options.card.cardId}` });
		this.contentEl.createEl("p", {
			text: "This removes the exact Card block from Markdown and active review. A content-free tombstone and review events are preserved. If interrupted, run Resume Card Deletion.",
		});
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const deleteButton = actionsEl.createEl("button", { cls: "mod-warning", text: "Delete Card" });
		cancelButton.addEventListener("click", () => this.close());
		deleteButton.addEventListener("click", () => void this.delete(deleteButton));
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async delete(deleteButton: HTMLButtonElement): Promise<void> {
		if (this.isDeleting) {
			return;
		}
		this.isDeleting = true;
		deleteButton.disabled = true;

		try {
			await this.options.onConfirmed();
			new Notice("Mneme: Card deleted. History tombstone preserved.");
			this.close();
			try {
				await this.options.onDeleted(this.options.card.cardId);
			} catch (error) {
				console.error("Mneme: Card deleted but views could not refresh", error);
				new Notice("Mneme: Card deleted. Reopen the Review View to refresh it.");
			}
		} catch (error) {
			console.error("Mneme: failed to delete Card", { cardId: this.options.card.cardId, error });
			new Notice(`Mneme: Card could not be deleted: ${formatUserFacingError(error, "Try again.")} Run Resume Card Deletion if a deletion record was saved.`);
		} finally {
			this.isDeleting = false;
			deleteButton.disabled = false;
		}
	}
}

export interface CardHistoryDeleteModalOptions {
	cardId: string;
	onConfirmed(cardId: string): Promise<void> | void;
}

export class CardHistoryDeleteModal extends Modal {
	constructor(app: App, private readonly options: CardHistoryDeleteModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Delete Card History Too");
		this.contentEl.createEl("p", {
			text: `Permanently erase the tombstone and review events for ${this.options.cardId}? This is complete erasure, not a routine way to reuse Card IDs.`,
		});
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const confirmButton = actionsEl.createEl("button", { cls: "mod-warning", text: "Delete History Too" });
		cancelButton.addEventListener("click", () => this.close());
		confirmButton.addEventListener("click", () => {
			confirmButton.disabled = true;
			void Promise.resolve(this.options.onConfirmed(this.options.cardId))
				.then(() => {
					new Notice("Mneme: Card history permanently erased.");
					this.close();
				})
				.catch((error) => {
					console.error("Mneme: failed to erase Card history", error);
					new Notice(`Mneme: Card history could not be erased: ${formatUserFacingError(error, "Try again.")}`);
					confirmButton.disabled = false;
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
