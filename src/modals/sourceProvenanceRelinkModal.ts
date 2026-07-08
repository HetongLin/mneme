import { App, Modal, Notice, TFile } from "obsidian";
import type { ConceptStaleSourceIssue } from "../models/conceptLibrary";
import type { SourceProvenanceRelinkPlan } from "../services/sourceProvenanceRelinkService";
import { SourceProvenanceRelinkService } from "../services/sourceProvenanceRelinkService";

export interface SourceProvenanceRelinkModalOptions {
	issue: ConceptStaleSourceIssue;
	onRelinked(): Promise<void> | void;
	service: SourceProvenanceRelinkService;
}

export class SourceProvenanceRelinkModal extends Modal {
	private isWorking = false;
	private plan?: SourceProvenanceRelinkPlan;

	constructor(app: App, private readonly options: SourceProvenanceRelinkModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Guided Source Relink");
		this.renderSetup();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderSetup(): void {
		this.plan = undefined;
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: "Choose the replacement for a missing Source Note. Mneme preserves the approved relation and evidence, and writes nothing until you confirm the preview.",
		});
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Missing: ${this.options.issue.link.sourcePath}`,
		});
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "Replacement Source Note path" });
		const inputEl = labelEl.createEl("input", {
			attr: { placeholder: "Course/New Source.md", type: "text" },
		});
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const previewButton = actionsEl.createEl("button", { text: "Build Preview" });
		cancelButton.addEventListener("click", () => this.close());
		previewButton.addEventListener("click", () => void this.prepare(inputEl.value, previewButton));
	}

	private async prepare(path: string, button: HTMLButtonElement): Promise<void> {
		if (this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		try {
			const result = await this.options.service.prepare(this.options.issue, path);
			if (result.status === "blocked") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			this.plan = result.plan;
			this.renderPreview(result.plan);
		} catch (error) {
			console.error("Mneme: failed to prepare Source relink", error);
			new Notice("Mneme: Source relink preview could not be built.");
		} finally {
			this.isWorking = false;
			button.disabled = false;
		}
	}

	private renderPreview(plan: SourceProvenanceRelinkPlan): void {
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: `${plan.issue.conceptTitle}: ${plan.issue.link.sourcePath} → ${plan.linkAfter.sourcePath}` });
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `${plan.linkAfter.relationType} relation · ${plan.linkAfter.evidence.length} evidence item(s) · ${plan.replacements} readable link replacement(s)`,
		});
		const detailsEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		detailsEl.createEl("summary", { text: "Preserved provenance" });
		detailsEl.createEl("p", { text: `Approved at: ${plan.linkAfter.addedAt}` });
		for (const evidence of plan.linkAfter.evidence) {
			detailsEl.createEl("p", { text: evidence.excerpt });
		}
		const beforeEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		beforeEl.createEl("summary", { text: `Before · ${plan.issue.conceptPath}` });
		beforeEl.createEl("pre", { text: plan.conceptBefore });
		const afterEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		afterEl.createEl("summary", { text: `After · ${plan.issue.conceptPath}` });
		afterEl.createEl("pre", { text: plan.conceptAfter });

		const reviewedLabel = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		const reviewedCheckbox = reviewedLabel.createEl("input", { attr: { type: "checkbox" } });
		reviewedLabel.createEl("span", { text: "I reviewed the replacement Source and the final Concept.md" });
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const backButton = actionsEl.createEl("button", { text: "Back" });
		const openSourceButton = actionsEl.createEl("button", { text: "Open Replacement Source" });
		const confirmButton = actionsEl.createEl("button", { text: "Confirm Relink" });
		confirmButton.disabled = true;
		reviewedCheckbox.addEventListener("change", () => {
			confirmButton.disabled = !reviewedCheckbox.checked || this.isWorking;
		});
		backButton.addEventListener("click", () => this.renderSetup());
		openSourceButton.addEventListener("click", () => void this.openSource(plan.newSource.path));
		confirmButton.addEventListener("click", () => void this.execute(confirmButton, backButton));
	}

	private async openSource(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice("Mneme: replacement Source Note is no longer available.");
			return;
		}
		await this.app.workspace.getLeaf("tab").openFile(file);
	}

	private async execute(confirmButton: HTMLButtonElement, backButton: HTMLButtonElement): Promise<void> {
		if (this.isWorking || !this.plan) return;
		this.isWorking = true;
		confirmButton.disabled = true;
		backButton.disabled = true;
		try {
			const result = await this.options.service.execute(this.plan);
			if (result.status !== "relinked") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			await this.options.onRelinked();
			new Notice("Mneme: Source provenance relinked.");
			this.close();
		} catch (error) {
			console.error("Mneme: Source relink failed", error);
			new Notice("Mneme: Source relink failed. See console.");
		} finally {
			this.isWorking = false;
			confirmButton.disabled = false;
			backButton.disabled = false;
		}
	}
}
