import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ConceptLoadSummary, MnemeConcept } from "../models/concept";
import { ReviewQueue, ReviewQueueCard, ReviewQueueConcept } from "../models/reviewQueue";
import { CardReviewState, ReviewRating } from "../models/reviewState";
import { ConceptLoader } from "../services/conceptLoader";
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
	private mode: ReviewMode = "queue";
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

	private async refreshCards(): Promise<void> {
		this.resetReviewState();
		this.statusMessage = "Scanning Card.md files...";
		this.render();

		try {
			const loadedConcepts = await this.loader.loadConcepts();

			this.reviewQueue = buildReviewQueue(loadedConcepts.concepts, this.reviewStateStore.getAllStates(), new Date());
			this.statusMessage = formatSummary(loadedConcepts.summary, this.reviewQueue.summary);
			this.render();
			new Notice(`Mneme: scanned ${loadedConcepts.summary.scannedCards} card files, ${loadedConcepts.summary.validCards} valid, ${loadedConcepts.summary.invalidCards} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review concepts", error);
			this.reviewQueue = createEmptyReviewQueue();
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
			toolbarEl.createEl("button", { text: "Back to Queue" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.backToQueue());
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
		const reviewableConcepts = this.getReviewableQueueConcepts();

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

	private renderConceptQueueItem(parentEl: HTMLElement, concept: ReviewQueueConcept): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-review-concept" });
		const textEl = itemEl.createDiv();
		const warningCount = getConceptIssueCount(concept.concept);
		const reviewedCount = getReviewedCardCount(concept);

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title mneme-review-concept-title",
			text: concept.title,
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta mneme-review-concept-meta",
			text: formatConceptMeta(concept, warningCount, reviewedCount),
		});

		const actionsEl = itemEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Flash Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.startFlashCards(concept));
		});
		actionsEl.createEl("button", { text: "Source" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openConceptSource(concept.concept);
			});
		});
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
				text: `Card ${reviewableCards.length} of ${reviewableCards.length}`,
			});
			cardEl.createEl("h3", {
				cls: "mneme-review-card-title",
				text: concept.title,
			});
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "Review complete.",
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
		const conceptEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });

		conceptEl.createEl("h4", { text: concept.title });
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

		this.renderDiagnosticQueueSection(conceptEl, "Due cards", concept.dueCards);
		this.renderDiagnosticQueueSection(conceptEl, "New cards", concept.newCards);
		this.renderDiagnosticQueueSection(conceptEl, "Later cards", concept.notDueCards);
		this.renderDiagnosticQueueSection(conceptEl, "Invalid cards", concept.invalidCards);
	}

	private renderDiagnosticQueueSection(parentEl: HTMLElement, label: string, cards: ReviewQueueCard[]): void {
		if (cards.length === 0) {
			return;
		}

		parentEl.createEl("h5", { text: label });

		for (const card of cards) {
			this.renderDiagnosticCard(parentEl, card);
		}
	}

	private renderDiagnosticCard(parentEl: HTMLElement, queueCard: ReviewQueueCard): void {
		const card = queueCard.card;
		const cardEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });

		cardEl.createEl("h5", { text: card.path });
		cardEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		cardEl.createEl("p", { text: `Due status: ${queueCard.dueStatus}` });
		cardEl.createEl("p", { text: `Review count: ${queueCard.reviewCount}` });
		cardEl.createEl("p", { text: `Due: ${queueCard.dueAt ?? "(unset)"}` });

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

	private backToQueue(): void {
		this.resetReviewState();
		this.statusMessage = "Back to review queue.";
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

		await this.app.workspace.getLeaf("tab").openFile(abstractFile);
		this.statusMessage = `Opened ${concept.title}.`;
		new Notice(`Opened ${concept.title}.`);
		this.render();
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

	private getReviewableQueueConcepts(): ReviewQueueConcept[] {
		return this.reviewQueue.concepts.filter((concept) => concept.reviewableCount > 0);
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

function formatConceptMeta(concept: ReviewQueueConcept, warningCount: number, reviewedCount: number): string {
	const metadata = [
		`${concept.dueCards.length} due`,
		`${concept.newCards.length} new`,
	];

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

function formatCardMeta(cardNumber: number, cardCount: number, reviewCount = 0): string {
	const cardLabel = `Card ${cardNumber} of ${cardCount}`;

	if (reviewCount === 0) {
		return cardLabel;
	}

	const reviewLabel = reviewCount === 1 ? "Reviewed 1 time" : `Reviewed ${reviewCount} times`;

	return `${cardLabel} · ${reviewLabel}`;
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
