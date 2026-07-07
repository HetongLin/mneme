import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type {
	ConceptLibraryFilter,
	ConceptLibrarySortMode,
	ConceptSummary,
} from "../models/conceptLibrary";
import { createConceptPreview } from "../services/conceptMarkdownParser";
import { ConceptScanner } from "../services/conceptScanner";
import {
	canGenerateCardsFromConcept,
	filterConceptSummaries,
	sortConceptSummaries,
} from "../services/conceptLibrarySearch";

export const CONCEPT_LIBRARY_VIEW_TYPE = "mneme-concept-library-view";

export interface ConceptLibraryActions {
	generateCards?(concept: ConceptSummary): Promise<void> | void;
}

export class MnemeConceptLibraryView extends ItemView {
	private concepts: ConceptSummary[] = [];
	private filter: ConceptLibraryFilter = {
		importance: "all",
		learningMode: "all",
		query: "",
	};
	private sortMode: ConceptLibrarySortMode = "title";
	private statusMessage = "Loading Concepts...";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly scanner: ConceptScanner,
		private readonly actions: ConceptLibraryActions = {},
	) {
		super(leaf);
	}

	getViewType(): string {
		return CONCEPT_LIBRARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Concept Library";
	}

	getIcon(): string {
		return "library";
	}

	protected async onOpen(): Promise<void> {
		this.render();
		await this.refresh();
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refresh(): Promise<void> {
		try {
			this.concepts = await this.scanner.scanConcepts();
			this.statusMessage = `${this.concepts.length} concepts found.`;
		} catch (error) {
			console.error("Mneme: failed to scan Concept Library", error);
			this.concepts = [];
			this.statusMessage = "Failed to scan Concept Library. See console for details.";
		}

		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");
		this.contentEl.addClass("mneme-concept-library-view");

		this.renderHeader();
		this.renderControls();
		this.renderStatus();
		this.renderConceptList();
	}

	private renderHeader(): void {
		const headerEl = this.contentEl.createDiv({ cls: "mneme-review-header" });
		const titleGroupEl = headerEl.createDiv();

		titleGroupEl.createEl("h2", {
			cls: "mneme-review-title",
			text: "Concept Library",
		});
		titleGroupEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Browse, search, and open your Mneme Concepts.",
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });
		toolbarEl.createEl("button", { text: "Refresh" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refresh();
			});
		});
	}

	private renderControls(): void {
		const controlsEl = this.contentEl.createDiv({ cls: "mneme-concept-library-controls" });
		const searchEl = controlsEl.createEl("input", {
			attr: {
				type: "search",
			},
			cls: "mneme-concept-library-search",
		});

		searchEl.placeholder = "Search concepts...";
		searchEl.value = this.filter.query ?? "";
		searchEl.addEventListener("input", () => {
			this.filter = {
				...this.filter,
				query: searchEl.value,
			};
			this.render();
		});

		this.renderSelect(controlsEl, "Learning mode", this.filter.learningMode ?? "all", [
			["all", "All"],
			["reviewable", "Reviewable"],
			["exploratory", "Exploratory"],
		], (value) => {
			this.filter = {
				...this.filter,
				learningMode: value as ConceptLibraryFilter["learningMode"],
			};
		});

		this.renderSelect(controlsEl, "Importance", this.filter.importance ?? "all", [
			["all", "All"],
			["low", "Low"],
			["normal", "Normal"],
			["high", "High"],
			["critical", "Critical"],
		], (value) => {
			this.filter = {
				...this.filter,
				importance: value as ConceptLibraryFilter["importance"],
			};
		});

		this.renderSelect(controlsEl, "Sort", this.sortMode, [
			["title", "Title"],
			["updatedAt_desc", "Recently updated"],
			["importance_desc", "Importance"],
		], (value) => {
			this.sortMode = value as ConceptLibrarySortMode;
		});
	}

	private renderSelect(
		parentEl: HTMLElement,
		label: string,
		value: string,
		options: Array<[string, string]>,
		onChange: (value: string) => void,
	): void {
		const labelEl = parentEl.createEl("label", { cls: "mneme-concept-library-filter" });
		labelEl.createEl("span", { text: label });
		const selectEl = labelEl.createEl("select");

		for (const [optionValue, optionLabel] of options) {
			const optionEl = selectEl.createEl("option", {
				text: optionLabel,
				value: optionValue,
			});

			optionEl.selected = optionValue === value;
		}

		selectEl.addEventListener("change", () => {
			onChange(selectEl.value);
			this.render();
		});
	}

	private renderStatus(): void {
		const visibleConcepts = this.getVisibleConcepts();
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${visibleConcepts.length} concepts` });
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.statusMessage,
		});
	}

	private renderConceptList(): void {
		const listEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });
		const visibleConcepts = this.getVisibleConcepts();

		if (visibleConcepts.length === 0) {
			listEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No Concepts found.",
			});
			listEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Write an approved Concept proposal first, or generate Concepts later through AI Capture.",
			});
			return;
		}

		for (const concept of visibleConcepts) {
			this.renderConceptCard(listEl, concept);
		}
	}

	private renderConceptCard(parentEl: HTMLElement, concept: ConceptSummary): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-concept-library-item" });
		const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
		const textEl = mainEl.createDiv();
		const preview = concept.coreMeaning ?? createConceptPreview(`# ${concept.title}\n\n${concept.whyItMatters ?? ""}`);

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title",
			text: concept.title,
		});
		textEl.createEl("p", {
			cls: "mneme-review-status",
			text: preview || "No preview available.",
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: formatConceptMeta(concept),
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: concept.path,
		});

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });
		actionsEl.createEl("button", { text: "Open Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openMarkdownPath(concept.path, "Concept");
			});
		});

		if (concept.cardsPath) {
			actionsEl.createEl("button", { text: "Open Cards" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.openMarkdownPath(concept.cardsPath, "Card");
				});
			});
		}

		if (this.actions.generateCards && canGenerateCardsFromConcept(concept)) {
			actionsEl.createEl("button", { text: "Generate Cards" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.actions.generateCards?.(concept);
				});
			});
		}

		const detailsEl = itemEl.createEl("details", { cls: "mneme-review-details" });
		detailsEl.createEl("summary", { text: "Preview" });
		detailsEl.createEl("p", { text: `Core Meaning: ${concept.coreMeaning ?? "Not provided."}` });
		detailsEl.createEl("p", { text: `Why It Matters: ${concept.whyItMatters ?? "Not provided."}` });
		detailsEl.createEl("p", { text: `Cards: ${concept.cardsPath ?? "No Card.md link."}` });
		detailsEl.createEl("p", { text: `Sources: ${formatCount(concept.sourceCount, "source")}` });
	}

	private getVisibleConcepts(): ConceptSummary[] {
		return sortConceptSummaries(
			filterConceptSummaries(this.concepts, this.filter),
			this.sortMode,
		);
	}

	private async openMarkdownPath(path: string | undefined, label: "Concept" | "Card"): Promise<void> {
		if (!path) {
			new Notice(label === "Card" ? "Mneme: Card file not found." : "Mneme: Concept file not found.");
			return;
		}

		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (!(abstractFile instanceof TFile)) {
			new Notice(label === "Card" ? "Mneme: Card file not found." : "Mneme: Concept file not found.");
			return;
		}

		const existingLeaf = this.findOpenMarkdownLeaf(path);

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			return;
		}

		await this.app.workspace.getLeaf("tab").openFile(abstractFile);
	}

	private findOpenMarkdownLeaf(path: string): WorkspaceLeaf | undefined {
		return this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
			const view = leaf.view;

			return view instanceof MarkdownView && view.file?.path === path;
		});
	}
}

function formatConceptMeta(concept: ConceptSummary): string {
	return [
		concept.learningMode ? formatLabel(concept.learningMode) : undefined,
		concept.importance ? `${formatLabel(concept.importance)} importance` : undefined,
		concept.cardCount !== undefined ? formatCount(concept.cardCount, "card") : undefined,
		concept.sourceCount !== undefined ? formatCount(concept.sourceCount, "source") : undefined,
	].filter(Boolean).join(" · ");
}

function formatCount(count: number | undefined, noun: string): string {
	if (count === undefined) {
		return `Unknown ${noun}s`;
	}

	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatLabel(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
