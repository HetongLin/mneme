import { App, Modal } from "obsidian";

export interface ConceptMergeConfirmationChange {
	after: string;
	before: string;
	label: string;
	path: string;
}

export interface ConceptMergeConfirmationOptions {
	changes: ConceptMergeConfirmationChange[];
	description: string;
	impact: string;
}

class ConceptMergeConfirmationModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly options: ConceptMergeConfirmationOptions,
		private readonly onResolve: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Confirm Merge");
		this.modalEl.addClass("mneme-concept-merge-confirmation-modal");
		this.contentEl.createEl("p", {
			cls: "mneme-concept-merge-impact",
			text: this.options.impact,
		});
		this.contentEl.createEl("p", {
			cls: "mneme-concept-merge-confirmation-description",
			text: this.options.description,
		});

		const advancedEl = this.contentEl.createEl("details", {
			cls: "mneme-review-details mneme-concept-merge-confirmation-details",
		});
		advancedEl.createEl("summary", { text: "Advanced / Markdown Changes" });
		for (const change of this.options.changes) {
			const changeEl = advancedEl.createEl("details", {
				cls: "mneme-concept-merge-confirmation-change",
			});
			changeEl.createEl("summary", { text: `${change.label} · ${change.path}` });
			changeEl.createEl("h5", { text: "Before" });
			changeEl.createEl("pre", { text: change.before });
			changeEl.createEl("h5", { text: "After" });
			changeEl.createEl("pre", { text: change.after });
		}

		const actionsEl = this.contentEl.createDiv({
			cls: "mneme-concept-merge-confirmation-actions",
		});
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const confirmButton = actionsEl.createEl("button", {
			cls: "mod-warning",
			text: "Confirm Merge",
		});
		cancelButton.addEventListener("click", () => this.resolve(false));
		confirmButton.addEventListener("click", () => this.resolve(true));
		cancelButton.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve(false);
		}
	}

	private resolve(confirmed: boolean): void {
		if (this.resolved) return;
		this.resolved = true;
		this.onResolve(confirmed);
		this.close();
	}
}

export function confirmConceptMerge(
	app: App,
	options: ConceptMergeConfirmationOptions,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConceptMergeConfirmationModal(app, options, resolve).open();
	});
}
