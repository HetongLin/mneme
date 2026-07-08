import { App, Modal, Notice } from "obsidian";
import type { ConceptDuplicateCandidate, ConceptSummary } from "../models/conceptLibrary";
import type { ConceptMergePlan } from "../services/conceptMergeService";
import { ConceptMergeService } from "../services/conceptMergeService";

export interface ConceptMergeModalOptions {
	candidate: ConceptDuplicateCandidate;
	onMerged(): Promise<void> | void;
	service: ConceptMergeService;
}

export class ConceptMergeModal extends Modal {
	private isWorking = false;
	private plan?: ConceptMergePlan;

	constructor(app: App, private readonly options: ConceptMergeModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Guided Concept Merge");
		this.contentEl.addClass("mneme-concept-merge-modal");
		this.renderSetup();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderSetup(): void {
		const { first, second } = this.options.candidate;
		this.plan = undefined;
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: "Choose the surviving Concept. No files or learning state change until you review the complete preview and confirm.",
		});
		const radioName = `mneme-merge-survivor-${Date.now()}`;
		const firstRadio = this.createConceptRadio(first, radioName, true);
		const secondRadio = this.createConceptRadio(second, radioName, false);
		const preserveLabel = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		const preserveCheckbox = preserveLabel.createEl("input", { attr: { type: "checkbox" } });
		preserveCheckbox.checked = true;
		preserveLabel.createEl("span", {
			text: "Preserve the merged note's narrative as an editable View in the survivor",
		});
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const previewButton = actionsEl.createEl("button", { text: "Build Final Preview" });
		cancelButton.addEventListener("click", () => this.close());
		previewButton.addEventListener("click", () => {
			const survivor = firstRadio.checked ? first : second;
			const merged = firstRadio.checked ? second : first;
			void this.preparePreview(survivor, merged, preserveCheckbox.checked, previewButton);
		});
		secondRadio.addEventListener("change", () => {
			if (secondRadio.checked) {
				firstRadio.checked = false;
			}
		});
	}

	private createConceptRadio(
		concept: ConceptSummary,
		name: string,
		checked: boolean,
	): HTMLInputElement {
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		const radio = labelEl.createEl("input", {
			attr: { name, type: "radio", value: concept.conceptId },
		});
		radio.checked = checked;
		labelEl.createEl("span", {
			text: `Keep ${concept.title} · ${concept.conceptId} · ${concept.path}`,
		});
		return radio;
	}

	private async preparePreview(
		survivor: ConceptSummary,
		merged: ConceptSummary,
		preserveMergedAsView: boolean,
		button: HTMLButtonElement,
	): Promise<void> {
		if (this.isWorking) {
			return;
		}
		this.isWorking = true;
		button.disabled = true;
		try {
			const result = await this.options.service.prepare({ merged, preserveMergedAsView, survivor });
			if (result.status === "blocked") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			this.plan = result.plan;
			this.renderPreview(result.plan);
		} catch (error) {
			console.error("Mneme: failed to prepare Guided Merge", error);
			new Notice("Mneme: Guided Merge preview could not be built.");
		} finally {
			this.isWorking = false;
			button.disabled = false;
		}
	}

	private renderPreview(plan: ConceptMergePlan): void {
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: `Survivor: ${plan.survivor.title} (${plan.survivor.conceptId})`,
		});
		this.contentEl.createEl("p", {
			text: `Redirect: ${plan.merged.title} (${plan.merged.conceptId})`,
		});
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `${plan.cardsMoved} Card(s) move without changing Card IDs or FSRS history · ${plan.sourceLinksMigrated} Source link(s) migrate and deduplicate.`,
		});
		const stateDetails = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		stateDetails.createEl("summary", { text: "State and provenance changes" });
		stateDetails.createEl("p", {
			text: plan.pauseMigrated
				? `Concept pause moves to ${plan.survivor.conceptId}.`
				: "No Concept pause moves.",
		});
		stateDetails.createEl("p", {
			text: `${plan.duplicateDismissalsMigrated} duplicate-dismissal decision(s) are rewritten or removed.`,
		});
		stateDetails.createEl("p", {
			text: `A permanent Merge Record reserves ${plan.merged.conceptId} and points to ${plan.survivor.conceptId}.`,
		});
		if (plan.sourceLinkChanges.length > 0) {
			const listEl = stateDetails.createEl("ul");
			for (const link of plan.sourceLinkChanges) {
				listEl.createEl("li", {
					text: `${link.sourcePath} · ${link.relationType} · ${link.status}`,
				});
			}
		}
		const survivorWrite = plan.writes.find((write) => write.path === plan.survivor.path);
		if (!survivorWrite) {
			new Notice("Mneme: surviving Concept preview is missing.");
			this.renderSetup();
			return;
		}

		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "Final surviving Concept.md — editable" });
		const textarea = labelEl.createEl("textarea", { cls: "mneme-concept-merge-markdown" });
		textarea.rows = 24;
		textarea.value = survivorWrite.after;

		const survivorBefore = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		survivorBefore.createEl("summary", { text: `Before · ${survivorWrite.path}` });
		survivorBefore.createEl("pre", { text: survivorWrite.before });
		for (const write of plan.writes.filter((candidate) => candidate.path !== plan.survivor.path)) {
			const detailsEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
			detailsEl.createEl("summary", { text: `${write.label} · ${write.path}` });
			detailsEl.createEl("h5", { text: "Before" });
			detailsEl.createEl("pre", { text: write.before });
			detailsEl.createEl("h5", { text: "After" });
			detailsEl.createEl("pre", { text: write.after });
		}

		const reviewedLabel = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		const reviewedCheckbox = reviewedLabel.createEl("input", { attr: { type: "checkbox" } });
		reviewedLabel.createEl("span", {
			text: "I reviewed the final Concept and every affected Markdown file",
		});
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const backButton = actionsEl.createEl("button", { text: "Back" });
		const mergeButton = actionsEl.createEl("button", { cls: "mod-warning", text: "Confirm Guided Merge" });
		mergeButton.disabled = true;
		reviewedCheckbox.addEventListener("change", () => {
			mergeButton.disabled = !reviewedCheckbox.checked || this.isWorking;
		});
		backButton.addEventListener("click", () => this.renderSetup());
		mergeButton.addEventListener("click", () => void this.execute(textarea.value, mergeButton, backButton));
	}

	private async execute(
		finalMarkdown: string,
		mergeButton: HTMLButtonElement,
		backButton: HTMLButtonElement,
	): Promise<void> {
		if (this.isWorking || !this.plan) {
			return;
		}
		this.isWorking = true;
		mergeButton.disabled = true;
		backButton.disabled = true;
		try {
			const result = await this.options.service.execute(this.plan, finalMarkdown);
			if (result.status !== "merged") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			try {
				await this.options.onMerged();
			} catch (refreshError) {
				console.error("Mneme: merge committed but UI refresh failed", refreshError);
				new Notice("Mneme: merge completed, but views could not refresh. Reopen Concept Library.");
				this.close();
				return;
			}
			new Notice("Mneme: Concepts merged. Card IDs and FSRS history preserved.");
			this.close();
		} catch (error) {
			console.error("Mneme: Guided Merge failed", error);
			new Notice("Mneme: Guided Merge failed. See console.");
		} finally {
			this.isWorking = false;
			mergeButton.disabled = false;
			backButton.disabled = false;
		}
	}
}
