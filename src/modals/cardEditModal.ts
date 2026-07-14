import { App, Component, Modal, Notice, TFile } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";
import { repairCardMarkers, updateCardMarkers } from "../services/cardMarkerEditor";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";

export interface CardEditModalOptions {
	card: LoadedMnemeCard;
	mode?: "edit" | "repair";
	onSaved(): Promise<void> | void;
}

export class CardEditModal extends Modal {
	private isSaving = false;
	private readonly markdownComponent = new Component();

	constructor(app: App, private readonly options: CardEditModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.markdownComponent.load();
		this.titleEl.setText(this.options.mode === "repair" ? "Repair Card" : "Edit Card");
		this.renderContent();
	}

	onClose(): void {
		this.markdownComponent.unload();
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
		contentEl.createEl("p", {
			cls: "mneme-markdown-edit-hint",
			text: "Select a preview to edit its Markdown source. Use $...$ inline and $$...$$ on separate lines for display math.",
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
		return createMarkdownLivePreviewField({
			app: this.app,
			component: this.markdownComponent,
			label,
			parentEl,
			sourcePath: this.options.card.path,
			value,
		});
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
