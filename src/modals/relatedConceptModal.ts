import { App, Modal, Notice } from "obsidian";
import type { ConceptSummary } from "../models/conceptLibrary";
import type { RelatedConceptService } from "../services/relatedConceptService";
import { formatUserFacingError } from "../utils/userFacingError";

export interface RelatedConceptModalOptions {
	concept: ConceptSummary;
	concepts: ConceptSummary[];
	onChanged(): Promise<void> | void;
	service: RelatedConceptService;
}

export class RelatedConceptModal extends Modal {
	private isWorking = false;
	private query = "";

	constructor(app: App, private readonly options: RelatedConceptModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Manage Related Concepts");
		this.contentEl.addClass("mneme-related-concept-modal");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Related links are symmetric. Updating ${this.options.concept.title} also updates the other Concept.`,
		});
		this.renderCurrent();
		this.renderAdd();
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		actionsEl.createEl("button", { text: "Close" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.close());
		});
	}

	private renderCurrent(): void {
		this.contentEl.createEl("h3", { text: "Related Concepts" });
		const related = new Set(this.options.concept.relatedConceptIds ?? []);
		const concepts = this.options.concepts.filter((concept) => related.has(concept.conceptId));
		if (concepts.length === 0) {
			this.contentEl.createEl("p", { cls: "mneme-review-status", text: "No Related Concepts yet." });
			return;
		}

		const listEl = this.contentEl.createDiv({ cls: "mneme-related-concept-list" });
		for (const concept of concepts) {
			const itemEl = listEl.createDiv({ cls: "mneme-review-queue-item" });
			itemEl.createEl("span", { text: concept.title });
			itemEl.createEl("button", { text: "Remove" }, (buttonEl) => {
				buttonEl.disabled = this.isWorking;
				buttonEl.addEventListener("click", () => void this.change("remove", concept, buttonEl));
			});
		}
	}

	private renderAdd(): void {
		this.contentEl.createEl("h3", { text: "Add Related Concept" });
		const input = this.contentEl.createEl("input", {
			attr: { type: "search" },
			cls: "mneme-concept-library-search",
		});
		input.placeholder = "Search approved Concepts...";
		input.value = this.query;
		input.addEventListener("input", () => {
			this.query = input.value;
			this.render();
			const next = this.contentEl.querySelector<HTMLInputElement>("input[type=search]");
			next?.focus();
			next?.setSelectionRange(this.query.length, this.query.length);
		});

		const related = new Set(this.options.concept.relatedConceptIds ?? []);
		const query = this.query.trim().toLocaleLowerCase();
		const candidates = this.options.concepts
			.filter((concept) => concept.conceptId !== this.options.concept.conceptId && !related.has(concept.conceptId))
			.filter((concept) => !query || [concept.title, concept.englishName, ...(concept.tags ?? [])]
				.some((value) => value?.toLocaleLowerCase().includes(query)))
			.slice(0, 20);

		if (candidates.length === 0) {
			this.contentEl.createEl("p", { cls: "mneme-review-status", text: "No matching Concepts." });
			return;
		}
		const listEl = this.contentEl.createDiv({ cls: "mneme-related-concept-list" });
		for (const concept of candidates) {
			const itemEl = listEl.createDiv({ cls: "mneme-review-queue-item" });
			itemEl.createEl("span", { text: concept.title });
			itemEl.createEl("button", { text: "Add" }, (buttonEl) => {
				buttonEl.disabled = this.isWorking;
				buttonEl.addEventListener("click", () => void this.change("add", concept, buttonEl));
			});
		}
	}

	private async change(
		action: "add" | "remove",
		other: ConceptSummary,
		button: HTMLButtonElement,
	): Promise<void> {
		if (this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		try {
			const prepared = action === "add"
				? await this.options.service.prepareAdd(this.options.concept, other)
				: await this.options.service.prepareRemove(this.options.concept, other);
			if (prepared.status === "blocked") {
				new Notice(`Mneme: ${prepared.message}`);
				return;
			}
			const result = await this.options.service.execute(prepared.plan);
			if (result.status === "conflict" || result.status === "failed") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			const relatedIds = new Set(this.options.concept.relatedConceptIds ?? []);
			if (action === "add") {
				relatedIds.add(other.conceptId);
			} else {
				relatedIds.delete(other.conceptId);
			}
			this.options.concept.relatedConceptIds = [...relatedIds].sort();
			new Notice(action === "add" ? "Mneme: Related Concept added." : "Mneme: Related Concept removed.");
			try {
				await this.options.onChanged();
			} catch (refreshError) {
				console.error("Mneme: Related Concept updated but Concept Library refresh failed", refreshError);
				new Notice("Mneme: Relationship updated, but Concept Library could not refresh. Reopen the Library to see it.");
			}
			this.close();
		} catch (error) {
			console.error("Mneme: Related Concept update failed", error);
			new Notice(`Mneme: relationship could not be updated: ${formatUserFacingError(error, "Refresh Concept Library and try again.")}`);
		} finally {
			this.isWorking = false;
			button.disabled = false;
		}
	}
}
