import { App, Modal } from "obsidian";

interface ConfirmClearReviewHistoryModalOptions {
	onConfirm(): Promise<void> | void;
}

export class ConfirmClearReviewHistoryModal extends Modal {
	private isConfirming = false;

	constructor(
		app: App,
		private readonly options: ConfirmClearReviewHistoryModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("mneme-clear-review-history-modal");

		this.titleEl.setText("Clear Review History");
		contentEl.createEl("p", {
			text: "This clears stored Mneme review history, including card review counts, ratings, and due dates.",
		});
		contentEl.createEl("p", {
			text: "It does not modify Concept Markdown, Card Markdown, or any notes in your vault.",
		});
		contentEl.createEl("p", {
			cls: "mneme-clear-review-history-modal-instruction",
			text: "Type CLEAR to confirm.",
		});

		const inputEl = contentEl.createEl("input", {
			attr: {
				"aria-label": "Type CLEAR to confirm",
				placeholder: "CLEAR",
				type: "text",
			},
			cls: "mneme-clear-review-history-modal-input",
		});

		const actionsEl = contentEl.createDiv({ cls: "mneme-clear-review-history-modal-actions" });
		const cancelButtonEl = actionsEl.createEl("button", { text: "Cancel" });
		const confirmButtonEl = actionsEl.createEl("button", {
			cls: "mod-warning",
			text: "Clear Review History",
		});
		confirmButtonEl.disabled = true;

		inputEl.addEventListener("input", () => {
			confirmButtonEl.disabled = inputEl.value !== "CLEAR" || this.isConfirming;
		});
		cancelButtonEl.addEventListener("click", () => this.close());
		confirmButtonEl.addEventListener("click", () => {
			void this.confirm(confirmButtonEl);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async confirm(confirmButtonEl: HTMLButtonElement): Promise<void> {
		if (this.isConfirming) {
			return;
		}

		this.isConfirming = true;
		confirmButtonEl.disabled = true;

		try {
			await this.options.onConfirm();
			this.close();
		} finally {
			this.isConfirming = false;
		}
	}
}
