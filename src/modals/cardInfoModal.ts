import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import type { LoadedMnemeCard } from "../models/card";

export interface CardInfoRow {
	label: string;
	value: string;
}

export interface CardInfoModalOptions {
	card: LoadedMnemeCard;
	conceptTitle: string;
	rows: CardInfoRow[];
}

export class CardInfoModal extends Modal {
	private readonly markdownComponent = new Component();

	constructor(app: App, private readonly options: CardInfoModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.markdownComponent.load();
		this.titleEl.setText("Card Info");
		this.renderContent();
	}

	onClose(): void {
		this.markdownComponent.unload();
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { card, conceptTitle, rows } = this.options;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mneme-card-info-modal");

		contentEl.createEl("h3", { text: conceptTitle });
		const gridEl = contentEl.createDiv({ cls: "mneme-card-info-grid" });
		for (const row of rows) {
			gridEl.createEl("span", { cls: "mneme-card-info-label", text: row.label });
			gridEl.createEl("span", { text: row.value });
		}

		if (card.rubric) {
			contentEl.createEl("h4", { text: "Rubric" });
			const rubricEl = contentEl.createDiv({ cls: "mneme-review-rubric mneme-markdown-content" });
			void MarkdownRenderer.render(
				this.app,
				card.rubric,
				rubricEl,
				card.path,
				this.markdownComponent,
			);
		}

		if (card.errors.length > 0) {
			this.renderIssues("Errors", card.errors);
		}
		if (card.warnings.length > 0) {
			this.renderIssues("Warnings", card.warnings);
		}
	}

	private renderIssues(title: string, issues: string[]): void {
		this.contentEl.createEl("h4", { text: title });
		const listEl = this.contentEl.createEl("ul");
		for (const issue of issues) {
			listEl.createEl("li", { text: issue });
		}
	}
}
