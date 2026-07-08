import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type {
	ConceptLibraryFilter,
	ConceptLibrarySortMode,
	ConceptDuplicateCandidate,
	ConceptIdentityIssue,
	ConceptSummary,
} from "../models/conceptLibrary";
import { ConceptEditModal } from "../modals/conceptEditModal";
import { ConceptIdRepairModal } from "../modals/conceptIdRepairModal";
import { createConceptPreview } from "../services/conceptMarkdownParser";
import { ConceptScanner } from "../services/conceptScanner";
import { ReviewStateStore } from "../services/reviewStateStore";
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
	private duplicateCandidates: ConceptDuplicateCandidate[] = [];
	private identityIssues: ConceptIdentityIssue[] = [];
	private filter: ConceptLibraryFilter = {
		importance: "all",
		learningMode: "all",
		query: "",
	};
	private sortMode: ConceptLibrarySortMode = "title";
	private statusMessage = "Loading Concepts...";
	private showDismissedDuplicates = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly scanner: ConceptScanner,
		private readonly reviewStateStore: ReviewStateStore,
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
			const result = await this.scanner.scan();
			this.concepts = result.concepts;
			this.duplicateCandidates = result.duplicateCandidates;
			this.identityIssues = result.identityIssues;
			this.statusMessage = `${this.concepts.length} concepts found. ${this.identityIssues.length} identity issue(s). ${this.getActiveDuplicateCandidates().length} possible duplicate(s).`;
		} catch (error) {
			console.error("Mneme: failed to scan Concept Library", error);
			this.concepts = [];
			this.duplicateCandidates = [];
			this.identityIssues = [];
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
		this.renderIdentityIssues();
		this.renderDuplicateCandidates();
		this.renderConceptList();
	}

	private renderDuplicateCandidates(): void {
		const dismissals = this.reviewStateStore.getConceptDuplicateDismissals();
		const active = this.duplicateCandidates.filter((candidate) => !dismissals[candidate.pairKey]);
		const dismissed = this.duplicateCandidates.filter((candidate) => !!dismissals[candidate.pairKey]);
		if (active.length === 0 && dismissed.length === 0) {
			return;
		}

		const sectionEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });
		sectionEl.createEl("h3", { text: "Possible Duplicates" });
		sectionEl.createEl("p", {
			cls: "mneme-review-status",
			text: "Candidates are diagnostic only. Mneme will not merge Concepts without a reviewed Guided Merge.",
		});
		for (const candidate of active) {
			this.renderDuplicateCandidate(sectionEl, candidate, false);
		}

		if (dismissed.length > 0) {
			sectionEl.createEl("button", {
				text: this.showDismissedDuplicates
					? "Hide dismissed"
					: `Show dismissed (${dismissed.length})`,
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					this.showDismissedDuplicates = !this.showDismissedDuplicates;
					this.render();
				});
			});
			if (this.showDismissedDuplicates) {
				for (const candidate of dismissed) {
					this.renderDuplicateCandidate(sectionEl, candidate, true);
				}
			}
		}
	}

	private renderDuplicateCandidate(
		parentEl: HTMLElement,
		candidate: ConceptDuplicateCandidate,
		dismissed: boolean,
	): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-concept-library-item" });
		const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
		const textEl = mainEl.createDiv();
		textEl.createEl("h3", { text: `${candidate.first.title} ↔ ${candidate.second.title}` });
		textEl.createEl("p", {
			cls: "mneme-review-status",
			text: candidate.reasons.join(" · "),
		});
		textEl.createEl("p", { text: `${candidate.first.title}: ${formatDuplicateCore(candidate.first.coreMeaning)}` });
		textEl.createEl("p", { text: `${candidate.second.title}: ${formatDuplicateCore(candidate.second.coreMeaning)}` });
		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });
		actionsEl.createEl("button", { text: `Open ${candidate.first.title}` }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.openMarkdownPath(candidate.first.path, "Concept"));
		});
		actionsEl.createEl("button", { text: `Open ${candidate.second.title}` }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.openMarkdownPath(candidate.second.path, "Concept"));
		});
		actionsEl.createEl("button", { text: dismissed ? "Reconsider" : "Not a duplicate" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.setDuplicateDismissal(candidate, dismissed);
			});
		});
	}

	private async setDuplicateDismissal(
		candidate: ConceptDuplicateCandidate,
		currentlyDismissed: boolean,
	): Promise<void> {
		try {
			if (currentlyDismissed) {
				await this.reviewStateStore.reconsiderConceptDuplicate(candidate.pairKey);
			} else {
				await this.reviewStateStore.dismissConceptDuplicate(
					candidate.first.conceptId,
					candidate.second.conceptId,
				);
			}
			this.statusMessage = currentlyDismissed
				? "Possible duplicate restored for review."
				: "Pair marked as not duplicate.";
			this.render();
		} catch (error) {
			console.error("Mneme: failed to update duplicate dismissal", error);
			new Notice("Mneme: duplicate decision could not be saved.");
		}
	}

	private getActiveDuplicateCandidates(): ConceptDuplicateCandidate[] {
		const dismissals = this.reviewStateStore.getConceptDuplicateDismissals();

		return this.duplicateCandidates.filter((candidate) => !dismissals[candidate.pairKey]);
	}

	private renderIdentityIssues(): void {
		if (this.identityIssues.length === 0) {
			return;
		}

		const sectionEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });
		sectionEl.createEl("h3", { text: "Identity Repair" });
		for (const issue of this.identityIssues) {
			const itemEl = sectionEl.createDiv({ cls: "mneme-review-queue-item mneme-concept-library-item" });
			const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
			const textEl = mainEl.createDiv();
			textEl.createEl("h3", { text: issue.title });
			textEl.createEl("p", {
				cls: "mneme-review-status",
				text: issue.kind === "missing_id"
					? "Concept ID is missing. This file is excluded from learning state until repaired."
					: `Concept ID is duplicated: ${issue.conceptId}`,
			});
			textEl.createEl("p", { cls: "mneme-review-queue-meta", text: issue.path });
			const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });
			actionsEl.createEl("button", {
				text: issue.kind === "missing_id" ? "Assign Stable ID" : "Replace Duplicate ID",
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.openIdentityRepair(issue));
			});
		}
	}

	private openIdentityRepair(issue: ConceptIdentityIssue): void {
		new ConceptIdRepairModal(this.app, {
			existingConceptIds: new Set([
				...this.concepts.map((concept) => concept.conceptId),
				...this.identityIssues.flatMap((candidate) => candidate.conceptId ? [candidate.conceptId] : []),
			]),
			issue,
			onSaved: async (oldConceptId, newConceptId, migrateState) => {
				if (migrateState && oldConceptId) {
					await this.reviewStateStore.rekeyConcept(oldConceptId, newConceptId);
				}
				void this.refresh();
			},
		}).open();
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
		actionsEl.createEl("button", { text: "Edit Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				new ConceptEditModal(this.app, {
					concept,
					onSaved: () => this.refresh(),
				}).open();
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

function formatDuplicateCore(value: string | undefined): string {
	if (!value) {
		return "No Core Meaning.";
	}
	const normalized = value.replace(/\s+/g, " ").trim();

	return normalized.length <= 320 ? normalized : `${normalized.slice(0, 319).trim()}…`;
}
