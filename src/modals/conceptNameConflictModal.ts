import { App, Modal } from "obsidian";
import type {
	ConceptNameConflict,
	ConceptNameConflictResolution,
} from "../services/conceptNameConflict";

export class ConceptNameConflictModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly conflict: ConceptNameConflict,
		private readonly onResolve: (resolution: ConceptNameConflictResolution) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Concept Name Conflict");
		this.contentEl.addClass("mneme-concept-name-conflict-modal");
		this.contentEl.createEl("p", {
			text: "A Concept already uses this name or identity. Choose how Mneme should continue.",
		});

		const comparisonEl = this.contentEl.createDiv({
			cls: "mneme-concept-name-conflict-comparison",
		});
		this.renderConcept(
			comparisonEl,
			"Existing Concept",
			this.conflict.existing.title,
			this.conflict.existing.englishName,
			this.conflict.existing.coreMeaning,
		);
		this.renderConcept(
			comparisonEl,
			"Incoming Concept",
			this.conflict.candidate.displayTitle,
			this.conflict.candidate.englishName,
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
		englishName?: string,
		coreMeaning?: string,
	): void {
		const conceptEl = parentEl.createDiv({ cls: "mneme-concept-name-conflict-item" });
		conceptEl.createEl("strong", { text: label });
		conceptEl.createEl("h3", { text: title });
		if (englishName && !title.includes(englishName)) {
			conceptEl.createEl("p", { text: `English Name: ${englishName}` });
		}
		if (coreMeaning) {
			conceptEl.createEl("p", {
				cls: "mneme-concept-name-conflict-meaning",
				text: coreMeaning,
			});
		}
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
	if (reason === "english_name") return "English Name";
	if (reason === "concept_id") return "Concept ID";
	return reason.charAt(0).toLocaleUpperCase() + reason.slice(1);
}
