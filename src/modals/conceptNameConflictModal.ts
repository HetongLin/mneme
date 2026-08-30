import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import type {
	ConceptNameConflict,
	ConceptNameConflictResolution,
} from "../services/conceptNameConflict";

export class ConceptNameConflictModal extends Modal {
	private readonly markdownComponent = new Component();
	private resolved = false;

	constructor(
		app: App,
		private readonly conflict: ConceptNameConflict,
		private readonly onResolve: (resolution: ConceptNameConflictResolution) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.markdownComponent.load();
		this.titleEl.setText("Concept Name Conflict");
		this.contentEl.addClass("mneme-concept-name-conflict-modal");
		this.contentEl.createEl("p", {
			text: "A Concept already uses this title, alias, or path. Choose how Mneme should continue.",
		});

		const comparisonEl = this.contentEl.createDiv({
			cls: "mneme-concept-name-conflict-comparison",
		});
		this.renderConcept(
			comparisonEl,
			"Existing Concept",
			this.conflict.existing.title,
			this.conflict.existing.coreMeaning,
			this.conflict.existing.path,
		);
		this.renderConcept(
			comparisonEl,
			"Incoming Concept",
			this.conflict.candidate.displayTitle,
			this.conflict.candidate.coreMeaning,
			this.conflict.candidate.path,
		);

		const reasons = this.conflict.reasons.map(formatReason).join(", ");
		this.contentEl.createEl("small", {
			cls: "mneme-concept-name-conflict-reasons",
			text: `Conflict detected by: ${reasons}.`,
		});

		const actionsEl = this.contentEl.createDiv({
			cls: "mneme-concept-name-conflict-actions",
		});
		this.createAction(actionsEl, "Merge", "merge", true);
		this.createAction(actionsEl, "Refine Name", "refine_name");
		this.createAction(actionsEl, "Keep Both", "keep_both");
		this.createAction(actionsEl, "Cancel", "cancel");
	}

	onClose(): void {
		this.markdownComponent.unload();
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.onResolve("cancel");
		}
	}

	private renderConcept(
		parentEl: HTMLElement,
		label: string,
		title: string,
		coreMeaning: string | undefined,
		sourcePath: string,
	): void {
		const conceptEl = parentEl.createEl("article", {
			cls: "mneme-concept-name-conflict-item",
		});
		conceptEl.createEl("strong", {
			cls: "mneme-concept-name-conflict-label",
			text: label,
		});
		conceptEl.createEl("h3", {
			cls: "mneme-concept-library-card-title",
			text: title,
		});
		const meaningEl = conceptEl.createDiv({
			cls: "mneme-concept-library-card-meaning mneme-concept-name-conflict-meaning",
		});
		const markdown = coreMeaning?.trim() || "No Core Meaning yet.";
		void MarkdownRenderer.render(this.app, markdown, meaningEl, sourcePath, this.markdownComponent)
			.catch((error) => {
				console.error("Mneme: failed to render conflict Core Meaning", error);
				meaningEl.empty();
				meaningEl.setText(markdown);
			});
	}

	private createAction(
		parentEl: HTMLElement,
		label: string,
		resolution: ConceptNameConflictResolution,
		primary = false,
	): void {
		parentEl.createEl("button", {
			cls: primary ? "mod-cta" : undefined,
			text: label,
		}, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.resolved = true;
				this.onResolve(resolution);
				this.close();
			});
		});
	}
}

export function chooseConceptNameConflictResolution(
	app: App,
	conflict: ConceptNameConflict,
): Promise<ConceptNameConflictResolution> {
	return new Promise((resolve) => {
		new ConceptNameConflictModal(app, conflict, resolve).open();
	});
}

function formatReason(reason: ConceptNameConflict["reasons"][number]): string {
	if (reason === "english_alias") return "English Alias";
	return reason.charAt(0).toLocaleUpperCase() + reason.slice(1);
}
