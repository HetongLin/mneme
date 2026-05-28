import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { ConceptLoadSummary, MnemeConcept } from "../models/concept";
import { CardReviewState, ReviewRating } from "../models/reviewState";
import { ConceptLoader } from "../services/conceptLoader";
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
	private concepts: MnemeConcept[] = [];
	private isAnswerShown = false;
	private isReviewComplete = false;
	private mode: ReviewMode = "queue";
	private selectedCardIndex = 0;
	private selectedConcept: MnemeConcept | null = null;
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

			this.concepts = loadedConcepts.concepts;
			this.statusMessage = formatSummary(loadedConcepts.summary);
			this.render();
			new Notice(`Mneme: scanned ${loadedConcepts.summary.scannedCards} card files, ${loadedConcepts.summary.validCards} valid, ${loadedConcepts.summary.invalidCards} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review concepts", error);
			this.concepts = [];
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
		const summary = summarizeConcepts(this.concepts);
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${summary.scannedCards} scanned` });
		summaryEl.createEl("span", { text: `${summary.validCards} valid cards` });
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
		const reviewableConcepts = this.getReviewableConcepts();

		if (reviewableConcepts.length === 0) {
			queueEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
			});
			return;
		}

		for (const concept of reviewableConcepts) {
			this.renderConceptQueueItem(queueEl, concept);
		}
	}

	private renderConceptQueueItem(parentEl: HTMLElement, concept: MnemeConcept): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-review-concept" });
		const textEl = itemEl.createDiv();
		const validCards = getReviewableCards(concept);
		const warningCount = getConceptIssueCount(concept);
		const reviewedCount = this.getReviewedCardCount(concept);

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title mneme-review-concept-title",
			text: concept.title,
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta mneme-review-concept-meta",
			text: formatConceptMeta(validCards.length, warningCount, reviewedCount),
		});

		const actionsEl = itemEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Flash Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.startFlashCards(concept));
		});
		actionsEl.createEl("button", { text: "Source" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openConceptSource(concept);
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

		const reviewableCards = getReviewableCards(concept);

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

		const currentCard = reviewableCards[this.selectedCardIndex];
		if (!currentCard) {
			this.isReviewComplete = true;
			this.render();
			return;
		}

		cardEl.createEl("p", {
			cls: "mneme-review-card-meta",
			text: formatCardMeta(this.selectedCardIndex + 1, reviewableCards.length, this.reviewStateStore.getState(currentCard.cardId)?.reviewCount),
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
				text: "No invalid cards or parser warnings.",
			});
			return;
		}

		for (const concept of diagnostics) {
			this.renderDiagnosticConcept(diagnosticsEl, concept);
		}
	}

	private renderDiagnosticConcept(parentEl: HTMLElement, concept: MnemeConcept): void {
		const conceptEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });

		conceptEl.createEl("h4", { text: concept.title });
		conceptEl.createEl("p", { text: `Folder: ${concept.folderPath || "(vault root)"}` });

		if (concept.conceptPath) {
			conceptEl.createEl("p", { text: `Concept: ${concept.conceptPath}` });
		}

		if (concept.errors.length > 0) {
			this.renderIssueList(conceptEl, "Concept errors", concept.errors);
		}

		if (concept.warnings.length > 0) {
			this.renderIssueList(conceptEl, "Concept warnings", concept.warnings);
		}

		for (const card of concept.cards) {
			if (card.isValid && card.warnings.length === 0 && !this.reviewStateStore.getState(card.cardId)) {
				continue;
			}

			this.renderDiagnosticCard(conceptEl, card);
		}
	}

	private renderDiagnosticCard(parentEl: HTMLElement, card: LoadedMnemeCard): void {
		const cardEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });
		const reviewState = this.reviewStateStore.getState(card.cardId);

		cardEl.createEl("h5", { text: card.path });
		cardEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		cardEl.createEl("p", { text: card.isValid ? "Status: valid" : "Status: invalid" });

		if (card.errors.length > 0) {
			this.renderIssueList(cardEl, "Errors", card.errors);
		}

		if (card.warnings.length > 0) {
			this.renderIssueList(cardEl, "Warnings", card.warnings);
		}

		if (reviewState) {
			cardEl.createEl("h5", { text: "Review state" });
			cardEl.createEl("p", { text: `Review count: ${reviewState.reviewCount}` });
			cardEl.createEl("p", { text: `Last rating: ${reviewState.lastRating ?? "(none)"}` });
			cardEl.createEl("p", { text: `Last reviewed: ${reviewState.lastReviewedAt ?? "(never)"}` });
			cardEl.createEl("p", { text: `Due: ${reviewState.dueAt ?? "(unset)"}` });
		}
	}

	private renderIssueList(parentEl: HTMLElement, label: string, issues: string[]): void {
		parentEl.createEl("h5", { text: label });
		const listEl = parentEl.createEl("ul");

		for (const issue of issues) {
			listEl.createEl("li", { text: issue });
		}
	}

	private startFlashCards(concept: MnemeConcept): void {
		this.mode = "flashcard";
		this.selectedConcept = concept;
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
			path: card.path,
			rating,
			updatedReviewState,
		});

		this.statusMessage = `Recorded ${label} for ${card.cardId}. Reviewed ${updatedReviewState.reviewCount} times.`;
		this.advanceToNextCard(this.statusMessage);
	}

	private advanceToNextCard(completionStatusMessage?: string): void {
		const concept = this.selectedConcept;
		const reviewableCards = concept ? getReviewableCards(concept) : [];

		this.isAnswerShown = false;

		if (this.selectedCardIndex + 1 < reviewableCards.length) {
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
		this.selectedCardIndex = 0;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
	}

	private getCurrentReviewableCard(): LoadedMnemeCard | undefined {
		const concept = this.selectedConcept;

		if (!concept) {
			return undefined;
		}

		return getReviewableCards(concept)[this.selectedCardIndex];
	}

	private getReviewableConcepts(): MnemeConcept[] {
		return this.concepts.filter((concept) => concept.isReviewable);
	}

	private getDiagnosticConcepts(): MnemeConcept[] {
		return this.concepts.filter((concept) => {
			return concept.errors.length > 0
				|| concept.warnings.length > 0
				|| concept.cards.some((card) => !card.isValid || card.warnings.length > 0 || this.reviewStateStore.getState(card.cardId));
		});
	}

	private getReviewedCardCount(concept: MnemeConcept): number {
		return getReviewableCards(concept).filter((card) => {
			return (this.reviewStateStore.getState(card.cardId)?.reviewCount ?? 0) > 0;
		}).length;
	}
}

function summarizeConcepts(concepts: MnemeConcept[]): ConceptLoadSummary {
	const cards = concepts.flatMap((concept) => concept.cards);
	const validCards = cards.filter((card) => card.isValid);

	return {
		concepts: concepts.length,
		invalidCards: cards.length - validCards.length,
		reviewableConcepts: concepts.filter((concept) => concept.isReviewable).length,
		scannedCards: cards.length,
		validCards: validCards.length,
	};
}

function formatSummary(summary: ConceptLoadSummary): string {
	return `Scanned ${summary.scannedCards} card files across ${summary.concepts} concepts.`;
}

function getReviewableCards(concept: MnemeConcept): LoadedMnemeCard[] {
	return concept.cards.filter((card) => card.isValid);
}

function formatConceptMeta(validCardCount: number, warningCount: number, reviewedCount: number): string {
	const cardLabel = validCardCount === 1 ? "1 card" : `${validCardCount} cards`;
	const metadata = [cardLabel];

	if (reviewedCount > 0) {
		metadata.push(`${reviewedCount} reviewed`);
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
