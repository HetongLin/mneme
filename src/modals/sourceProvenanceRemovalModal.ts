import { App, Modal, Notice } from "obsidian";
import type { ConceptStaleSourceIssue } from "../models/conceptLibrary";
import { SourceProvenanceRemovalService, type SourceProvenanceRemovalPlan } from "../services/sourceProvenanceRemovalService";

export interface SourceProvenanceRemovalModalOptions {
	issue: ConceptStaleSourceIssue;
	onRemoved(): Promise<void> | void;
	service: SourceProvenanceRemovalService;
}

export class SourceProvenanceRemovalModal extends Modal {
	private plan?: SourceProvenanceRemovalPlan;
	private working = false;

	constructor(app: App, private readonly options: SourceProvenanceRemovalModalOptions) { super(app); }

	onOpen(): void {
		this.titleEl.setText("Remove Stale Provenance");
		void this.prepare();
	}

	onClose(): void { this.contentEl.empty(); }

	private async prepare(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: "Building a zero-write preview…" });
		const result = await this.options.service.prepare(this.options.issue);
		if (result.status === "blocked") {
			new Notice(`Mneme: ${result.message}`);
			this.close();
			return;
		}
		this.plan = result.plan;
		this.renderPreview(result.plan);
	}

	private renderPreview(plan: SourceProvenanceRemovalPlan): void {
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: `Remove the approved ${plan.issue.link.relationType} relationship from ${plan.issue.conceptTitle} to ${plan.issue.link.sourcePath}.`,
		});
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: plan.readableEntryPreserved
				? "The readable Source entry remains because another relationship still uses it."
				: `${plan.removals} readable Source entry or entries will be removed.`,
		});
		for (const evidence of plan.issue.link.evidence) {
			this.contentEl.createEl("p", { text: evidence.excerpt });
		}
		const beforeEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		beforeEl.createEl("summary", { text: `Before · ${plan.issue.conceptPath}` });
		beforeEl.createEl("pre", { text: plan.conceptBefore });
		const afterEl = this.contentEl.createEl("details", { cls: "mneme-review-details" });
		afterEl.createEl("summary", { text: `After · ${plan.issue.conceptPath}` });
		afterEl.createEl("pre", { text: plan.conceptAfter });
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		const checkbox = labelEl.createEl("input", { attr: { type: "checkbox" } });
		labelEl.createEl("span", { text: "I reviewed this permanent provenance removal" });
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const removeButton = actionsEl.createEl("button", { cls: "mod-warning", text: "Confirm Removal" });
		removeButton.disabled = true;
		checkbox.addEventListener("change", () => { removeButton.disabled = !checkbox.checked || this.working; });
		cancelButton.addEventListener("click", () => this.close());
		removeButton.addEventListener("click", () => void this.execute(removeButton, cancelButton));
	}

	private async execute(removeButton: HTMLButtonElement, cancelButton: HTMLButtonElement): Promise<void> {
		if (!this.plan || this.working) return;
		this.working = true;
		removeButton.disabled = true;
		cancelButton.disabled = true;
		try {
			const result = await this.options.service.execute(this.plan);
			if (result.status !== "removed") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			await this.options.onRemoved();
			new Notice("Mneme: stale Source provenance removed.");
			this.close();
		} finally {
			this.working = false;
			removeButton.disabled = false;
			cancelButton.disabled = false;
		}
	}
}
