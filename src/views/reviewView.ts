import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ConceptMemorySummary } from "../models/conceptMemory";
import { RankedReviewQueueConcept } from "../models/conceptQueue";
import { ConceptLoadSummary, MnemeConcept } from "../models/concept";
import { ReviewQueue, ReviewQueueCard, ReviewQueueConcept } from "../models/reviewQueue";
import { CardReviewState, ReviewRating } from "../models/reviewState";
import { ConceptLoader } from "../services/conceptLoader";
import { aggregateConceptMemoryById } from "../services/conceptMemoryAggregator";
import { indexRankedConceptsById, rankReviewQueueConcepts } from "../services/conceptQueueRanker";
import { buildReviewQueue } from "../services/reviewQueueBuilder";
import { ReviewStateStore } from "../services/reviewStateStore";

export const REVIEW_VIEW_TYPE = "mneme-review-view";

type ReviewMode = "queue" | "flashcard";
type ReviewRatingLabel = "Again" | "Hard" | "Good" | "Easy";

const REVIEW_RATINGS: Array<{ label: ReviewRatingLabel; value: ReviewRating }> = [
	{ label: "Again", value: "again" },
	{ label: "Hard", value: "hard" },
	{ label: "Good", value: "good" },
	{ label: "Easy", value: "easy" },
];

export class MnemeReviewView extends ItemView {
	private readonly loader: ConceptLoader;
	private isAnswerShown = false;
	private isReviewComplete = false;
	private memorySummaries: Record<string, ConceptMemorySummary> = {};
	private mode: ReviewMode = "queue";
	private rankedConceptsById: Record<string, RankedReviewQueueConcept> = {};
	private rankedReviewQueue: RankedReviewQueueConcept[] = [];
	private reviewQueue: ReviewQueue = createEmptyReviewQueue();
	private selectedCardIndex = 0;
	private selectedCards: ReviewQueueCard[] = [];
	private selectedConcept: ReviewQueueConcept | null = null;
	private statusMessage = "Ready to scan Card.md files.";

	constructor(leaf: WorkspaceLeaf, private readonly reviewStateStore: ReviewStateStore) {
		super(leaf);
		this.loader = new ConceptLoader(this.app);
	}

	getViewType(): string {
		return REVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Mneme Review";
	}

	getIcon(): string {
		return "book-open";
	}

	protected async onOpen(): Promise<void> {
		this.render();
		await this.refreshCards();
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refreshCards(): Promise<void> {
		this.resetReviewState();
		this.statusMessage = "Scanning Card.md files...";
		this.render();

		try {
			const loadedConcepts = await this.loader.loadConcepts();
			const reviewStates = this.reviewStateStore.getAllStates();
			const now = new Date();

			this.reviewQueue = buildReviewQueue(loadedConcepts.concepts, reviewStates, now);
			this.memorySummaries = aggregateConceptMemoryById(this.reviewQueue.concepts, reviewStates, now);
			this.rankedReviewQueue = rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries);
			this.rankedConceptsById = indexRankedConceptsById(rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries, {
				includeNonReviewable: true,
			}));
			this.statusMessage = formatSummary(loadedConcepts.summary, this.reviewQueue.summary);
			this.render();
			new Notice(`Mneme: scanned ${loadedConcepts.summary.scannedCards} card files, ${loadedConcepts.summary.validCards} valid, ${loadedConcepts.summary.invalidCards} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review concepts", error);
			this.reviewQueue = createEmptyReviewQueue();
			this.memorySummaries = {};
			this.rankedConceptsById = {};
			this.rankedReviewQueue = [];
			this.statusMessage = "Failed to scan concepts. See console for details.";
			this.render();
			new Notice("Mneme: failed to scan concepts. See console for details.");
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");

		if (this.mode === "flashcard") {
			this.renderFlashCardMode();
			return;
		}

		this.renderQueueMode();
	}

	private renderQueueMode(): void {
		this.renderHeader("Review Queue", true);
		this.renderSummary();
		this.renderQueue();
		this.renderDiagnostics();
	}

	private renderFlashCardMode(): void {
		this.renderHeader("Flash Cards", false);
		this.renderStatus();
		this.renderFlashCard();
	}

	private renderHeader(subtitle: string, showRefresh: boolean): void {
		const headerEl = this.contentEl.createDiv({ cls: "mneme-review-header" });
		const titleGroupEl = headerEl.createDiv();

		titleGroupEl.createEl("h2", {
			cls: "mneme-review-title",
			text: "Mneme Review",
		});
		titleGroupEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: subtitle,
		});

		const toolbarEl = headerEl.createDiv({ cls: "mneme-review-toolbar" });

		if (!showRefresh) {
			toolbarEl.createEl("button", { text: "Back to Concepts" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.backToConcepts());
			});
			return;
		}

		toolbarEl.createEl("button", { text: "Refresh Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refreshCards();
			});
		});
	}

	private renderSummary(): void {
		const summary = this.reviewQueue.summary;
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${summary.dueCards} due` });
		summaryEl.createEl("span", { text: `${summary.newCards} new` });
		summaryEl.createEl("span", { text: `${summary.notDueCards} later` });
		summaryEl.createEl("span", { text: `${summary.invalidCards} invalid cards` });
		summaryEl.createEl("span", { text: `${summary.reviewableConcepts} concepts` });
		this.renderStatus();
	}

	private renderStatus(): void {
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.statusMessage,
		});
	}

	private renderQueue(): void {
		const queueEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });
		const reviewableConcepts = this.rankedReviewQueue;

		if (reviewableConcepts.length === 0) {
			queueEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No cards due right now.",
			});
			queueEl.createEl("p", {
				cls: "mneme-review-status",
				text: "Use Advanced Diagnostics to inspect future cards.",
			});
			return;
		}

		for (const concept of reviewableConcepts) {
			this.renderConceptQueueItem(queueEl, concept);
		}
	}

	private renderConceptQueueItem(parentEl: HTMLElement, rankedConcept: RankedReviewQueueConcept): void {
		const concept = rankedConcept.concept;
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-review-concept" });
		const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
		const textEl = mainEl.createDiv();
		const warningCount = getConceptIssueCount(concept.concept);
		const reviewedCount = getReviewedCardCount(concept);

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title mneme-review-concept-title",
			text: concept.title,
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta mneme-review-concept-meta",
			text: formatConceptMeta(concept, rankedConcept, warningCount, reviewedCount),
		});

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Flash Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.startFlashCards(concept));
		});
		actionsEl.createEl("button", { text: "Source" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openConceptSource(concept.concept);
			});
		});

		this.renderConceptDetails(itemEl, concept, rankedConcept);
	}

	private renderFlashCard(): void {
		const concept = this.selectedConcept;
		const cardEl = this.contentEl.createDiv({ cls: "mneme-review-card" });

		if (!concept) {
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
			});
			return;
		}

		const reviewableCards = this.selectedCards;

		if (reviewableCards.length === 0) {
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
			});
			return;
		}

		if (this.isReviewComplete) {
			cardEl.createEl("p", {
				cls: "mneme-review-card-meta",
				text: `${reviewableCards.length} ${reviewableCards.length === 1 ? "card" : "cards"} reviewed`,
			});
			cardEl.createEl("h3", {
				cls: "mneme-review-card-title",
				text: concept.title,
			});
			cardEl.createEl("p", {
				cls: "mneme-review-complete",
				text: "Review complete.",
			});
			const actionsEl = cardEl.createDiv({ cls: "mneme-review-actions" });
			actionsEl.createEl("button", { cls: "mneme-review-source-action", text: "Source" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.openConceptSource(concept.concept);
				});
			});
			return;
		}

		const currentQueueCard = reviewableCards[this.selectedCardIndex];
		if (!currentQueueCard) {
			this.isReviewComplete = true;
			this.render();
			return;
		}
		const currentCard = currentQueueCard.card;

		cardEl.createEl("p", {
			cls: "mneme-review-card-meta",
			text: formatCardMeta(this.selectedCardIndex + 1, reviewableCards.length, currentQueueCard.reviewCount),
		});
		cardEl.createEl("h3", {
			cls: "mneme-review-card-title",
			text: concept.title,
		});

		cardEl.createEl("div", {
			cls: "mneme-review-front",
			text: currentCard.front || "(empty)",
		});

		this.renderCurrentCardDetails(cardEl, currentQueueCard);

		if (!this.isAnswerShown) {
			const actionsEl = cardEl.createDiv({ cls: "mneme-review-actions" });
			actionsEl.createEl("button", { text: "Show Answer" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.showAnswer());
			});
			return;
		}

		cardEl.createEl("div", {
			cls: "mneme-review-answer",
			text: currentCard.back || "(empty)",
		});

		if (currentCard.rubric) {
			cardEl.createEl("div", {
				cls: "mneme-review-rubric",
				text: currentCard.rubric,
			});
		}

		const ratingsEl = cardEl.createDiv({ cls: "mneme-review-rating-row" });
		for (const rating of REVIEW_RATINGS) {
			ratingsEl.createEl("button", { text: rating.label }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.rateCurrentCard(rating.value, rating.label);
				});
			});
		}
	}

	private renderDiagnostics(): void {
		const diagnostics = this.getDiagnosticConcepts();
		const diagnosticsEl = this.contentEl.createEl("details", {
			cls: "mneme-review-diagnostics",
		});

		diagnosticsEl.createEl("summary", { text: "Advanced Diagnostics" });

		if (diagnostics.length === 0) {
			diagnosticsEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No card diagnostics.",
			});
			return;
		}

		for (const concept of diagnostics) {
			this.renderDiagnosticConcept(diagnosticsEl, concept);
		}
	}

	private renderDiagnosticConcept(parentEl: HTMLElement, concept: ReviewQueueConcept): void {
		const conceptEl = parentEl.createEl("details", { cls: "mneme-review-diagnostics-item" });
		const rankedConcept = this.rankedConceptsById[concept.conceptId];
		const memorySummary = this.memorySummaries[concept.conceptId];

		conceptEl.createEl("summary", { text: formatDiagnosticConceptSummary(concept, rankedConcept) });
		conceptEl.createEl("p", { text: `Folder: ${concept.concept.folderPath || "(vault root)"}` });

		if (concept.concept.conceptPath) {
			conceptEl.createEl("p", { text: `Concept: ${concept.concept.conceptPath}` });
		}

		if (concept.concept.errors.length > 0) {
			this.renderIssueList(conceptEl, "Concept errors", concept.concept.errors);
		}

		if (concept.concept.warnings.length > 0) {
			this.renderIssueList(conceptEl, "Concept warnings", concept.concept.warnings);
		}

		if (memorySummary) {
			this.renderConceptMemorySummary(conceptEl, memorySummary, rankedConcept);
		}

		this.renderDiagnosticQueueSection(conceptEl, "Due cards", concept.dueCards, memorySummary);
		this.renderDiagnosticQueueSection(conceptEl, "New cards", concept.newCards, memorySummary);
		this.renderDiagnosticQueueSection(conceptEl, "Later cards", concept.notDueCards, memorySummary);
		this.renderDiagnosticQueueSection(conceptEl, "Invalid cards", concept.invalidCards, memorySummary);
	}

	private renderConceptMemorySummary(
		parentEl: HTMLElement,
		memorySummary: ConceptMemorySummary,
		rankedConcept?: RankedReviewQueueConcept,
	): void {
		parentEl.createEl("h5", { text: "Concept memory" });
		parentEl.createEl("p", { text: `Rank: ${rankedConcept ? `#${rankedConcept.rank}` : "(unranked)"}` });
		parentEl.createEl("p", { text: `Priority: ${formatPriorityBand(memorySummary)} (${formatPercent(memorySummary.priorityScore)})` });
		parentEl.createEl("p", { text: `Top-${memorySummary.topK} average risk: ${formatPercent(memorySummary.topKAvgRisk)}` });
		parentEl.createEl("p", { text: `Weakest risk: ${formatPercent(memorySummary.weakestRisk)}` });
		parentEl.createEl("p", { text: `Average risk: ${formatPercent(memorySummary.averageRisk)}` });
		parentEl.createEl("p", { text: `Due ratio: ${formatPercent(memorySummary.dueRatio)}` });
		parentEl.createEl("p", { text: `New ratio: ${formatPercent(memorySummary.newRatio)}` });
		parentEl.createEl("p", { text: `Lapse ratio: ${formatPercent(memorySummary.lapseRatio)}` });
		parentEl.createEl("p", { text: `Counts: ${memorySummary.dueCardCount} due · ${memorySummary.newCardCount} new · ${memorySummary.notDueCardCount} later · ${memorySummary.invalidCardCount} invalid` });
	}

	private renderDiagnosticQueueSection(
		parentEl: HTMLElement,
		label: string,
		cards: ReviewQueueCard[],
		memorySummary?: ConceptMemorySummary,
	): void {
		if (cards.length === 0) {
			return;
		}

		parentEl.createEl("h5", { text: label });

		for (const card of cards) {
			this.renderDiagnosticCard(parentEl, card, memorySummary);
		}
	}

	private renderDiagnosticCard(
		parentEl: HTMLElement,
		queueCard: ReviewQueueCard,
		memorySummary?: ConceptMemorySummary,
	): void {
		const card = queueCard.card;
		const cardRisk = memorySummary?.cardRisks.find((risk) => risk.cardId === queueCard.cardId);
		const cardEl = parentEl.createEl("details", { cls: "mneme-review-diagnostics-card" });

		cardEl.createEl("summary", {
			text: `${card.cardId} · ${queueCard.dueStatus} · risk ${cardRisk ? formatPercent(cardRisk.risk) : "(unset)"}`,
		});
		cardEl.createEl("p", { text: `Path: ${card.path}` });
		cardEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		cardEl.createEl("p", { text: `Card index: ${card.cardIndex}` });
		cardEl.createEl("p", { text: `Due status: ${queueCard.dueStatus}` });
		cardEl.createEl("p", { text: `Review count: ${queueCard.reviewCount}` });
		cardEl.createEl("p", { text: `Due: ${queueCard.dueAt ?? "(unset)"}` });
		cardEl.createEl("p", { text: `Risk: ${cardRisk ? formatPercent(cardRisk.risk) : "(unset)"}` });
		cardEl.createEl("p", { text: `Risk source: ${cardRisk?.riskSource ?? "(unset)"}` });
		cardEl.createEl("p", { text: `Retrievability: ${cardRisk?.retrievability === undefined ? "(unset)" : formatPercent(cardRisk.retrievability)}` });
		if (queueCard.reviewCount > 0) {
			const reviewState = this.reviewStateStore.getState(card.cardId);
			this.renderReviewStateDetails(cardEl, reviewState);
		}

		if (card.errors.length > 0) {
			this.renderIssueList(cardEl, "Errors", card.errors);
		}

		if (card.warnings.length > 0) {
			this.renderIssueList(cardEl, "Warnings", card.warnings);
		}
	}

	private renderIssueList(parentEl: HTMLElement, label: string, issues: string[]): void {
		parentEl.createEl("h5", { text: label });
		const listEl = parentEl.createEl("ul");

		for (const issue of issues) {
			listEl.createEl("li", { text: issue });
		}
	}

	private renderConceptDetails(
		parentEl: HTMLElement,
		concept: ReviewQueueConcept,
		rankedConcept: RankedReviewQueueConcept,
	): void {
		const detailsEl = parentEl.createEl("details", { cls: "mneme-review-details" });
		const memorySummary = this.memorySummaries[concept.conceptId];

		detailsEl.createEl("summary", { text: "Details" });

		if (memorySummary) {
			this.renderCompactMemoryDetails(detailsEl, memorySummary, rankedConcept);
		}

		this.renderCompactCardStatuses(detailsEl, concept);
	}

	private renderCompactMemoryDetails(
		parentEl: HTMLElement,
		memorySummary: ConceptMemorySummary,
		rankedConcept: RankedReviewQueueConcept,
	): void {
		const detailsGridEl = parentEl.createDiv({ cls: "mneme-review-details-grid" });

		detailsGridEl.createEl("span", { text: `Rank #${rankedConcept.rank}` });
		detailsGridEl.createEl("span", { text: `Priority ${formatPercent(memorySummary.priorityScore)}` });
		detailsGridEl.createEl("span", { text: `Top-${memorySummary.topK} risk ${formatPercent(memorySummary.topKAvgRisk)}` });
		detailsGridEl.createEl("span", { text: `Weakest ${formatPercent(memorySummary.weakestRisk)}` });
		detailsGridEl.createEl("span", { text: `Due ${formatPercent(memorySummary.dueRatio)}` });
		detailsGridEl.createEl("span", { text: `New ${formatPercent(memorySummary.newRatio)}` });
		detailsGridEl.createEl("span", { text: `Lapse ${formatPercent(memorySummary.lapseRatio)}` });
	}

	private renderCompactCardStatuses(parentEl: HTMLElement, concept: ReviewQueueConcept): void {
		const cards = getAllQueueCards(concept);
		if (cards.length === 0) {
			return;
		}

		const listEl = parentEl.createEl("ul", { cls: "mneme-review-details-list" });
		for (const card of cards) {
			listEl.createEl("li", {
				text: `${card.cardId} · ${card.dueStatus} · ${formatReviewCount(card.reviewCount)}`,
			});
		}
	}

	private renderCurrentCardDetails(parentEl: HTMLElement, queueCard: ReviewQueueCard): void {
		const card = queueCard.card;
		const reviewState = this.reviewStateStore.getState(card.cardId);
		const cardRisk = this.memorySummaries[queueCard.conceptId]?.cardRisks.find((risk) => risk.cardId === queueCard.cardId);
		const detailsEl = parentEl.createEl("details", { cls: "mneme-review-card-details" });

		detailsEl.createEl("summary", { text: "Card details" });
		detailsEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		detailsEl.createEl("p", { text: `Card index: ${card.cardIndex}` });
		detailsEl.createEl("p", { text: `Due status: ${queueCard.dueStatus}` });
		detailsEl.createEl("p", { text: `Review count: ${reviewState?.reviewCount ?? queueCard.reviewCount}` });
		detailsEl.createEl("p", { text: `Last rating: ${reviewState?.lastRating ?? "(none)"}` });
		detailsEl.createEl("p", { text: `Due: ${reviewState?.dueAt ?? queueCard.dueAt ?? "(unset)"}` });
		detailsEl.createEl("p", { text: `Risk source: ${cardRisk?.riskSource ?? "(unset)"}` });
		detailsEl.createEl("p", { text: `Retrievability: ${cardRisk?.retrievability === undefined ? "(unset)" : formatPercent(cardRisk.retrievability)}` });
		this.renderReviewStateDetails(detailsEl, reviewState);

		if (card.errors.length > 0) {
			this.renderIssueList(detailsEl, "Errors", card.errors);
		}

		if (card.warnings.length > 0) {
			this.renderIssueList(detailsEl, "Warnings", card.warnings);
		}
	}

	private renderReviewStateDetails(parentEl: HTMLElement, reviewState: CardReviewState | undefined): void {
		if (!reviewState) {
			return;
		}

		parentEl.createEl("p", { text: `Scheduler: ${reviewState.scheduler ?? "(unset)"}` });
		parentEl.createEl("p", { text: `FSRS state: ${reviewState.fsrsState ?? "(unset)"}` });
		parentEl.createEl("p", { text: `Stability: ${formatOptionalNumber(reviewState.stability)}` });
		parentEl.createEl("p", { text: `Difficulty: ${formatOptionalNumber(reviewState.difficulty)}` });
		parentEl.createEl("p", { text: `Scheduled days: ${formatOptionalNumber(reviewState.scheduledDays)}` });
		parentEl.createEl("p", { text: `Learning step: ${formatOptionalNumber(reviewState.learningSteps)}` });
	}

	private startFlashCards(concept: ReviewQueueConcept): void {
		this.mode = "flashcard";
		this.selectedConcept = concept;
		this.selectedCards = getQueuedReviewCards(concept);
		this.selectedCardIndex = 0;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.statusMessage = "Flash card ready.";
		this.render();
	}

	private backToConcepts(): void {
		this.resetReviewState();
		this.statusMessage = "Back to concepts.";
		this.render();
	}

	private showAnswer(): void {
		this.isAnswerShown = true;
		this.statusMessage = "Answer shown.";
		this.render();
	}

	private async rateCurrentCard(rating: ReviewRating, label: ReviewRatingLabel): Promise<void> {
		const concept = this.selectedConcept;
		const card = this.getCurrentReviewableCard();

		if (!concept || !card) {
			this.statusMessage = "Review complete.";
			this.isReviewComplete = true;
			this.render();
			return;
		}

		let updatedReviewState: CardReviewState;
		try {
			updatedReviewState = await this.reviewStateStore.recordReview(card.cardId, rating);
		} catch (error) {
			console.error("Mneme: failed to record review rating", {
				cardId: card.cardId,
				conceptTitle: concept.title,
				error,
				rating,
			});
			this.statusMessage = "Could not record review. See console for details.";
			new Notice("Mneme: could not record review. See console for details.");
			this.render();
			return;
		}

		console.info("Mneme: review rating selected", {
			cardId: card.cardId,
			cardIndex: this.selectedCardIndex + 1,
			conceptTitle: concept.title,
			path: card.card.path,
			rating,
			updatedReviewState,
		});

		this.statusMessage = `Recorded ${label} for ${card.cardId}. Reviewed ${updatedReviewState.reviewCount} times.`;
		this.advanceToNextCard(this.statusMessage);
	}

	private advanceToNextCard(completionStatusMessage?: string): void {
		this.isAnswerShown = false;

		if (this.selectedCardIndex + 1 < this.selectedCards.length) {
			this.selectedCardIndex += 1;
		} else {
			this.isReviewComplete = true;
			this.statusMessage = completionStatusMessage ?? "Review complete.";
		}

		this.render();
	}

	private async openConceptSource(concept: MnemeConcept): Promise<void> {
		if (!concept.conceptPath) {
			console.info("Mneme: no Concept.md found for source navigation", {
				folderPath: concept.folderPath,
				title: concept.title,
			});
			this.statusMessage = "No Concept.md found for this concept.";
			new Notice("No Concept.md found for this concept.");
			this.render();
			return;
		}

		const abstractFile = this.app.vault.getAbstractFileByPath(concept.conceptPath);
		if (!(abstractFile instanceof TFile)) {
			console.warn("Mneme: Concept.md path did not resolve to a file", {
				conceptPath: concept.conceptPath,
				title: concept.title,
			});
			this.statusMessage = "No Concept.md found for this concept.";
			new Notice("No Concept.md found for this concept.");
			this.render();
			return;
		}

		const existingLeaf = this.findOpenMarkdownLeaf(concept.conceptPath);
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
			this.statusMessage = `Opened ${concept.title}.`;
			new Notice(`Opened ${concept.title}.`);
			this.render();
			return;
		}

		await this.app.workspace.getLeaf("tab").openFile(abstractFile);
		this.statusMessage = `Opened ${concept.title}.`;
		new Notice(`Opened ${concept.title}.`);
		this.render();
	}

	private findOpenMarkdownLeaf(path: string): WorkspaceLeaf | undefined {
		return this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
			const view = leaf.view;
			return view instanceof MarkdownView && view.file?.path === path;
		});
	}

	private resetReviewState(): void {
		this.mode = "queue";
		this.selectedConcept = null;
		this.selectedCards = [];
		this.selectedCardIndex = 0;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
	}

	private getCurrentReviewableCard(): ReviewQueueCard | undefined {
		return this.selectedCards[this.selectedCardIndex];
	}

	private getDiagnosticConcepts(): ReviewQueueConcept[] {
		return this.reviewQueue.concepts.filter((concept) => {
			return concept.concept.errors.length > 0
				|| concept.concept.warnings.length > 0
				|| concept.dueCards.length > 0
				|| concept.newCards.length > 0
				|| concept.notDueCards.length > 0
				|| concept.invalidCards.length > 0;
		});
	}
}

function createEmptyReviewQueue(): ReviewQueue {
	return {
		concepts: [],
		summary: {
			concepts: 0,
			dueCards: 0,
			invalidCards: 0,
			newCards: 0,
			notDueCards: 0,
			reviewableConcepts: 0,
		},
	};
}

function formatSummary(loadSummary: ConceptLoadSummary, queueSummary: ReviewQueue["summary"]): string {
	return `Scanned ${loadSummary.scannedCards} cards across ${loadSummary.concepts} concepts. ${queueSummary.dueCards} due, ${queueSummary.newCards} new.`;
}

function getQueuedReviewCards(concept: ReviewQueueConcept): ReviewQueueCard[] {
	return [
		...concept.dueCards,
		...concept.newCards,
	];
}

function getAllQueueCards(concept: ReviewQueueConcept): ReviewQueueCard[] {
	return [
		...concept.dueCards,
		...concept.newCards,
		...concept.notDueCards,
		...concept.invalidCards,
	];
}

function formatConceptMeta(
	concept: ReviewQueueConcept,
	rankedConcept: RankedReviewQueueConcept | undefined,
	warningCount: number,
	reviewedCount: number,
): string {
	const metadata = rankedConcept ? [formatPriorityLabel(rankedConcept)] : [];

	metadata.push(
		`${concept.dueCards.length} due`,
		`${concept.newCards.length} new`,
	);

	if (reviewedCount > 0) {
		metadata.push(`${reviewedCount} reviewed`);
	}

	if (concept.notDueCards.length > 0) {
		metadata.push(`${concept.notDueCards.length} later`);
	}

	if (warningCount > 0) {
		const warningLabel = warningCount === 1 ? "1 note" : `${warningCount} notes`;
		metadata.push(warningLabel);
	}

	return metadata.join(" · ");
}

function formatPriorityLabel(rankedConcept: RankedReviewQueueConcept): string {
	return `${formatPriorityBand(rankedConcept)} priority`;
}

function formatPriorityBand(summary: Pick<ConceptMemorySummary, "priorityBand"> | Pick<RankedReviewQueueConcept, "priorityBand">): string {
	return summary.priorityBand.charAt(0).toUpperCase() + summary.priorityBand.slice(1);
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatOptionalNumber(value: number | undefined): string {
	if (value === undefined) {
		return "(unset)";
	}

	return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

function formatDiagnosticConceptSummary(
	concept: ReviewQueueConcept,
	rankedConcept?: RankedReviewQueueConcept,
): string {
	const rankLabel = rankedConcept ? `#${rankedConcept.rank}` : "Unranked";
	const priorityLabel = rankedConcept ? formatPriorityLabel(rankedConcept) : "Low priority";

	return `${concept.title} · ${rankLabel} · ${priorityLabel} · ${concept.dueCards.length} due · ${concept.newCards.length} new · ${concept.notDueCards.length} later · ${concept.invalidCards.length} invalid`;
}

function formatCardMeta(cardNumber: number, cardCount: number, reviewCount = 0): string {
	const cardLabel = `Card ${cardNumber} of ${cardCount}`;

	if (reviewCount === 0) {
		return cardLabel;
	}

	const reviewLabel = reviewCount === 1 ? "Reviewed 1 time" : `Reviewed ${reviewCount} times`;

	return `${cardLabel} · ${reviewLabel}`;
}

function formatReviewCount(reviewCount: number): string {
	if (reviewCount === 0) {
		return "not reviewed";
	}

	return reviewCount === 1 ? "reviewed 1 time" : `reviewed ${reviewCount} times`;
}

function getConceptIssueCount(concept: MnemeConcept): number {
	return concept.errors.length
		+ concept.warnings.length
		+ concept.cards.reduce((count, card) => count + card.errors.length + card.warnings.length, 0);
}

function getReviewedCardCount(concept: ReviewQueueConcept): number {
	return [
		...concept.dueCards,
		...concept.newCards,
		...concept.notDueCards,
	].filter((card) => card.reviewCount > 0).length;
}
