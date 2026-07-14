import { ItemView, MarkdownView, Notice, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type {
	ConceptLibraryFilter,
	ConceptLibrarySortMode,
	ConceptDuplicateCandidate,
	ConceptIdentityIssue,
	ConceptStaleSourceIssue,
	ConceptSummary,
} from "../models/conceptLibrary";
import { ConceptEditModal } from "../modals/conceptEditModal";
import { ConceptIdRepairModal } from "../modals/conceptIdRepairModal";
import { ConceptMergeModal } from "../modals/conceptMergeModal";
import { SourceProvenanceRelinkModal } from "../modals/sourceProvenanceRelinkModal";
import { SourceProvenanceRemovalModal } from "../modals/sourceProvenanceRemovalModal";
import { ConceptScanner } from "../services/conceptScanner";
import { ReviewStateStore } from "../services/reviewStateStore";
import type { ConceptMergeService } from "../services/conceptMergeService";
import type { SourceProvenanceRelinkService } from "../services/sourceProvenanceRelinkService";
import type { SourceProvenanceRemovalService } from "../services/sourceProvenanceRemovalService";
import {
	canGenerateCardsFromConcept,
	filterConceptSummaries,
	sortConceptSummaries,
} from "../services/conceptLibrarySearch";

export const CONCEPT_LIBRARY_VIEW_TYPE = "mneme-concept-library-view";

export interface ConceptLibraryActions {
	conceptMergeService?: ConceptMergeService;
	createConcept?(): Promise<void> | void;
	sourceRelinkService?: SourceProvenanceRelinkService;
	sourceRemovalService?: SourceProvenanceRemovalService;
	generateCards?(concept: ConceptSummary): Promise<void> | void;
}

export class MnemeConceptLibraryView extends ItemView {
	private concepts: ConceptSummary[] = [];
	private duplicateCandidates: ConceptDuplicateCandidate[] = [];
	private identityIssues: ConceptIdentityIssue[] = [];
	private staleSourceIssues: ConceptStaleSourceIssue[] = [];
	private filter: ConceptLibraryFilter = {
		importance: "all",
		learningMode: "all",
		query: "",
		tag: "all",
	};
	private sortMode: ConceptLibrarySortMode = "title";
	private statusMessage: string | undefined = "Loading Concepts...";
	private showDismissedDuplicates = false;
	private areFiltersOpen = false;
	private isMaintenanceOpen = false;

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
			this.staleSourceIssues = result.staleSourceIssues;
			this.statusMessage = undefined;
		} catch (error) {
			console.error("Mneme: failed to scan Concept Library", error);
			this.concepts = [];
			this.duplicateCandidates = [];
			this.identityIssues = [];
			this.staleSourceIssues = [];
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
		this.renderMaintenance();
	}

	private renderStaleSourceIssues(parentEl: HTMLElement): void {
		if (this.staleSourceIssues.length === 0) return;
		const sectionEl = parentEl.createDiv({ cls: "mneme-review-queue" });
		sectionEl.createEl("h3", { text: "Stale Source Provenance" });
		sectionEl.createEl("p", {
			cls: "mneme-review-status",
			text: "The original Source Note is missing. Relink only when you have identified its replacement.",
		});
		for (const issue of this.staleSourceIssues) {
			const itemEl = sectionEl.createDiv({ cls: "mneme-review-queue-item mneme-concept-library-item" });
			const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
			mainEl.createEl("h3", { text: issue.conceptTitle });
			mainEl.createEl("p", { cls: "mneme-review-status", text: `Missing Source: ${issue.link.sourcePath}` });
			mainEl.createEl("p", {
				cls: "mneme-review-queue-meta",
				text: `${issue.link.relationType} · ${issue.link.evidence.length} evidence item(s)`,
			});
			const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });
			actionsEl.createEl("button", { text: "Open Concept" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => void this.openMarkdownPath(issue.conceptPath, "Concept"));
			});
			if (this.actions.sourceRelinkService) {
				actionsEl.createEl("button", { text: "Relink Source" }, (buttonEl) => {
					buttonEl.addEventListener("click", () => {
						new SourceProvenanceRelinkModal(this.app, {
							issue,
							onRelinked: async () => {
								await this.reviewStateStore.load();
								await this.refresh();
							},
							service: this.actions.sourceRelinkService!,
						}).open();
					});
				});
			}
			if (this.actions.sourceRemovalService) {
				actionsEl.createEl("button", { text: "Remove Provenance" }, (buttonEl) => {
					buttonEl.addEventListener("click", () => {
						new SourceProvenanceRemovalModal(this.app, {
							issue,
							onRemoved: async () => {
								await this.reviewStateStore.load();
								await this.refresh();
							},
							service: this.actions.sourceRemovalService!,
						}).open();
					});
				});
			}
		}
	}

	private renderDuplicateCandidates(parentEl: HTMLElement): void {
		const dismissals = this.reviewStateStore.getConceptDuplicateDismissals();
		const active = this.duplicateCandidates.filter((candidate) => !dismissals[candidate.pairKey]);
		const dismissed = this.duplicateCandidates.filter((candidate) => !!dismissals[candidate.pairKey]);
		if (active.length === 0 && dismissed.length === 0) {
			return;
		}

		const sectionEl = parentEl.createDiv({ cls: "mneme-review-queue" });
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
		const mergeService = this.actions.conceptMergeService;
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
		if (!dismissed && mergeService) {
			actionsEl.createEl("button", { text: "Guided Merge" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					new ConceptMergeModal(this.app, {
						candidate,
						onMerged: async () => {
							await this.reviewStateStore.load();
							await this.refresh();
						},
						service: mergeService,
					}).open();
				});
			});
		}
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

	private renderIdentityIssues(parentEl: HTMLElement): void {
		if (this.identityIssues.length === 0) {
			return;
		}

		const sectionEl = parentEl.createDiv({ cls: "mneme-review-queue" });
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
				...Object.keys(this.reviewStateStore.getConceptMergeRecords()),
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
			text: "Quickly revisit the meaning of your approved Concepts.",
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });
		if (this.actions.createConcept) {
			toolbarEl.createEl("button", { text: "Create Concept" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => void this.actions.createConcept?.());
			});
		}
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
			const cursorPosition = searchEl.selectionStart ?? searchEl.value.length;
			this.filter = {
				...this.filter,
				query: searchEl.value,
			};
			this.render();
			const nextSearchEl = this.contentEl.querySelector<HTMLInputElement>(".mneme-concept-library-search");
			nextSearchEl?.focus();
			nextSearchEl?.setSelectionRange(cursorPosition, cursorPosition);
		});

		const filtersEl = controlsEl.createEl("details", { cls: "mneme-concept-library-filters" });
		filtersEl.open = this.areFiltersOpen;
		filtersEl.addEventListener("toggle", () => {
			this.areFiltersOpen = filtersEl.open;
		});
		filtersEl.createEl("summary", { text: "Filters" });
		const filterGridEl = filtersEl.createDiv({ cls: "mneme-concept-library-filter-grid" });

		this.renderSelect(filterGridEl, "Learning mode", this.filter.learningMode ?? "all", [
			["all", "All"],
			["reviewable", "Reviewable"],
			["exploratory", "Exploratory"],
		], (value) => {
			this.filter = {
				...this.filter,
				learningMode: value as ConceptLibraryFilter["learningMode"],
			};
		});

		this.renderSelect(filterGridEl, "Importance", this.filter.importance ?? "all", [
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

		this.renderSelect(filterGridEl, "Tag", this.filter.tag ?? "all", [
			["all", "All"],
			...this.getAllTags().map((tag): [string, string] => [tag, tag]),
		], (value) => {
			this.filter = {
				...this.filter,
				tag: value,
			};
		});

		this.renderSelect(filterGridEl, "Sort", this.sortMode, [
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

		summaryEl.createEl("span", {
			text: visibleConcepts.length === this.concepts.length
				? `${visibleConcepts.length} Concepts`
				: `${visibleConcepts.length} of ${this.concepts.length} Concepts`,
		});
		const maintenanceCount = this.getMaintenanceItemCount();
		if (maintenanceCount > 0) {
			summaryEl.createEl("span", { text: `${maintenanceCount} maintenance item${maintenanceCount === 1 ? "" : "s"}` });
		}
		if (this.statusMessage) {
			this.contentEl.createEl("p", {
				cls: "mneme-review-status",
				text: this.statusMessage,
			});
		}
	}

	private renderConceptList(): void {
		const listEl = this.contentEl.createDiv({ cls: "mneme-concept-library-grid" });
		const visibleConcepts = this.getVisibleConcepts();

		if (visibleConcepts.length === 0) {
			const emptyEl = listEl.createDiv({ cls: "mneme-concept-library-empty" });
			emptyEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No Concepts found.",
			});
			emptyEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Create a Concept or adjust the current search and filters.",
			});
			return;
		}

		for (const concept of visibleConcepts) {
			this.renderConceptCard(listEl, concept);
		}
	}

	private renderConceptCard(parentEl: HTMLElement, concept: ConceptSummary): void {
		const cardEl = parentEl.createEl("article", { cls: "mneme-concept-library-card" });
		const openEl = cardEl.createEl("button", {
			attr: { "aria-label": `Open ${concept.title}` },
			cls: "mneme-concept-library-card-open",
		});
		openEl.createEl("span", {
			cls: "mneme-concept-library-card-title",
			text: concept.title,
		});
		openEl.createEl("span", {
			cls: "mneme-concept-library-card-meaning",
			text: formatCoreMeaning(concept.coreMeaning),
		});
		openEl.addEventListener("click", () => {
			void this.openMarkdownPath(concept.path, "Concept");
		});

		const moreEl = cardEl.createEl("details", { cls: "mneme-concept-library-card-more" });
		moreEl.createEl("summary", { text: "More" });
		const actionsEl = moreEl.createDiv({ cls: "mneme-concept-library-card-actions" });
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
					void this.openCardTarget(concept.cardsPath);
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
	}

	private renderMaintenance(): void {
		const hasMaintenance = this.identityIssues.length > 0
			|| this.staleSourceIssues.length > 0
			|| this.duplicateCandidates.length > 0;
		if (!hasMaintenance) return;

		const detailsEl = this.contentEl.createEl("details", { cls: "mneme-concept-library-maintenance" });
		detailsEl.open = this.isMaintenanceOpen;
		detailsEl.addEventListener("toggle", () => {
			this.isMaintenanceOpen = detailsEl.open;
		});
		const count = this.getMaintenanceItemCount();
		detailsEl.createEl("summary", {
			text: count > 0 ? `Library maintenance (${count})` : "Library maintenance",
		});
		const contentEl = detailsEl.createDiv({ cls: "mneme-concept-library-maintenance-content" });
		this.renderIdentityIssues(contentEl);
		this.renderStaleSourceIssues(contentEl);
		this.renderDuplicateCandidates(contentEl);
	}

	private getMaintenanceItemCount(): number {
		return this.identityIssues.length
			+ this.staleSourceIssues.length
			+ this.getActiveDuplicateCandidates().length;
	}

	private getVisibleConcepts(): ConceptSummary[] {
		return sortConceptSummaries(
			filterConceptSummaries(this.concepts, this.filter),
			this.sortMode,
		);
	}

	private getAllTags(): string[] {
		return [...new Set(this.concepts.flatMap((concept) => concept.tags ?? []))]
			.sort((first, second) => first.localeCompare(second, undefined, { sensitivity: "base" }));
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

	private async openCardTarget(path: string | undefined): Promise<void> {
		if (!path) {
			new Notice("Mneme: Card Group or legacy Card folder not found.");
			return;
		}

		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (abstractFile instanceof TFile) {
			await this.openMarkdownPath(path, "Card");
			return;
		}

		if (abstractFile instanceof TFolder) {
			await this.revealInFileExplorer(abstractFile);
			return;
		}

		new Notice("Mneme: Card Group not found. Generate and accept Cards first.");
	}

	private async revealInFileExplorer(target: TAbstractFile): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0]
			?? this.app.workspace.getLeftLeaf(false);

		if (!leaf) {
			new Notice("Mneme: could not open the file explorer.");
			return;
		}

		if (leaf.view.getViewType() !== "file-explorer") {
			await leaf.setViewState({ active: true, type: "file-explorer" });
		}

		await this.app.workspace.revealLeaf(leaf);
		const view = leaf.view as unknown as {
			revealInFolder?: (file: TAbstractFile) => void;
		};

		if (typeof view.revealInFolder === "function") {
			view.revealInFolder(target);
		}
	}

	private findOpenMarkdownLeaf(path: string): WorkspaceLeaf | undefined {
		return this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
			const view = leaf.view;

			return view instanceof MarkdownView && view.file?.path === path;
		});
	}
}

function formatCoreMeaning(value: string | undefined): string {
	return value?.trim() || "No Core Meaning yet.";
}

function formatDuplicateCore(value: string | undefined): string {
	if (!value) {
		return "No Core Meaning.";
	}
	const normalized = value.replace(/\s+/g, " ").trim();

	return normalized.length <= 320 ? normalized : `${normalized.slice(0, 319).trim()}…`;
}
