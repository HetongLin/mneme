import { App, Modal, Notice, TFile } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";
import { repairCardMarkers, updateCardMarkers } from "../services/cardMarkerEditor";

export interface CardEditModalOptions {
	card: LoadedMnemeCard;
	mode?: "edit" | "repair";
	onSaved(): Promise<void> | void;
}

export class CardEditModal extends Modal {
	private isSaving = false;

	constructor(app: App, private readonly options: CardEditModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.options.mode === "repair" ? "Repair Card" : "Edit Card");
		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { card } = this.options;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mneme-card-edit-modal");

		contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Editing ${card.path}`,
		});
		const frontInput = this.createTextarea(contentEl, "Front", card.front);
		const backInput = this.createTextarea(contentEl, "Back", card.back);
		const rubricInput = this.createTextarea(contentEl, "Rubric", card.rubric ?? "");
		const actionsEl = contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", {
			text: this.options.mode === "repair" ? "Repair Card" : "Save Card",
		});

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => {
			void this.save(frontInput.value, backInput.value, rubricInput.value, saveButton);
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

	private async save(
		front: string,
		back: string,
		rubric: string,
		saveButton: HTMLButtonElement,
	): Promise<void> {
		if (this.isSaving) {
			return;
		}

		this.isSaving = true;
		saveButton.disabled = true;

		try {
			const { card } = this.options;
			const abstractFile = this.app.vault.getAbstractFileByPath(card.path);

			if (!(abstractFile instanceof TFile)) {
				new Notice("Mneme: Card Markdown was not found.");
				return;
			}

			const currentMarkdown = await this.app.vault.cachedRead(abstractFile);
			const writeMarkers = this.options.mode === "repair" ? repairCardMarkers : updateCardMarkers;
			const result = writeMarkers(currentMarkdown, {
				back,
				cardBlockIndex: card.cardIndex,
				explicitCardId: card.hasExplicitCardId ? card.cardId : undefined,
				front,
				rubric,
			});

			if (result.status !== "updated") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}

			await this.app.vault.modify(abstractFile, result.markdown);
			await this.options.onSaved();
			new Notice(this.options.mode === "repair"
				? "Mneme: Card markers repaired. Review schedule unchanged."
				: "Mneme: Card updated. Review schedule unchanged.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to edit Card", {
				error,
				path: this.options.card.path,
			});
			new Notice("Mneme: Card could not be updated. See console.");
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}
}
