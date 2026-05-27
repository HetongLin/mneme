import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { CardFileLoader } from "../services/cardFileLoader";

export const REVIEW_VIEW_TYPE = "mneme-review-view";

type ReviewRating = "Again" | "Hard" | "Good" | "Easy";

interface CardScanSummary {
	invalidCount: number;
	totalCount: number;
	validCount: number;
}

const REVIEW_RATINGS: ReviewRating[] = ["Again", "Hard", "Good", "Easy"];

export class MnemeReviewView extends ItemView {
	private readonly loader: CardFileLoader;
	private cards: LoadedMnemeCard[] = [];
	private currentIndex = 0;
	private isAnswerShown = false;
	private statusMessage = "Ready to scan Card.md files.";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.loader = new CardFileLoader(this.app);
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
		this.statusMessage = "Scanning Card.md files...";
		this.currentIndex = 0;
		this.isAnswerShown = false;
		this.render();

		try {
			this.cards = await this.loader.loadCardFiles();
			const summary = summarizeCards(this.cards);

			this.statusMessage = formatSummary(summary);
			this.render();
			new Notice(`Mneme: scanned ${summary.totalCount} card files, ${summary.validCount} valid, ${summary.invalidCount} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review view cards", error);
			this.cards = [];
			this.statusMessage = "Failed to scan Card.md files. See console for details.";
			this.render();
			new Notice("Mneme: failed to scan card files. See console for details.");
		}
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");

		this.contentEl.createEl("h2", { text: "Mneme Review" });
		this.renderControls();
		this.renderSummary();
		this.renderReviewPanel();
		this.renderDiagnostics();
	}

	private renderControls(): void {
		const controlsEl = this.contentEl.createDiv({ cls: "mneme-review-controls" });
		controlsEl.createEl("button", { text: "Refresh Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refreshCards();
			});
		});
	}

	private renderSummary(): void {
		const summary = summarizeCards(this.cards);
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("p", { text: this.statusMessage });
		summaryEl.createEl("p", {
			text: `Scanned: ${summary.totalCount} | Valid: ${summary.validCount} | Invalid: ${summary.invalidCount}`,
		});
	}

	private renderReviewPanel(): void {
		const panelEl = this.contentEl.createDiv({ cls: "mneme-review-panel" });
		const reviewableCards = this.getReviewableCards();

		panelEl.createEl("h3", { text: "Review" });

		if (reviewableCards.length === 0) {
			panelEl.createEl("p", { text: "No valid cards available for review." });
			return;
		}

		if (this.currentIndex >= reviewableCards.length) {
			panelEl.createEl("p", { text: "Review complete." });
			return;
		}

		const currentCard = reviewableCards[this.currentIndex];
		if (!currentCard) {
			panelEl.createEl("p", { text: "No valid cards available for review." });
			return;
		}

		panelEl.createEl("p", { text: `Card ${this.currentIndex + 1} of ${reviewableCards.length}` });
		panelEl.createEl("p", { text: currentCard.path });

		panelEl.createEl("h4", { text: "Front" });
		panelEl.createEl("pre", { text: currentCard.front || "(empty)" });

		if (!this.isAnswerShown) {
			panelEl.createEl("button", { text: "Show Answer" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.showAnswer());
			});
		} else {
			this.renderAnswer(panelEl, currentCard);
			this.renderRatingButtons(panelEl);
		}

		this.renderNavigation(panelEl, reviewableCards.length);
	}

	private renderAnswer(parentEl: HTMLElement, card: LoadedMnemeCard): void {
		parentEl.createEl("h4", { text: "Back" });
		parentEl.createEl("pre", { text: card.back || "(empty)" });

		if (card.rubric) {
			parentEl.createEl("h4", { text: "Rubric" });
			parentEl.createEl("pre", { text: card.rubric });
		}
	}

	private renderRatingButtons(parentEl: HTMLElement): void {
		const ratingsEl = parentEl.createDiv({ cls: "mneme-review-ratings" });

		for (const rating of REVIEW_RATINGS) {
			ratingsEl.createEl("button", { text: rating }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.rateCurrentCard(rating));
			});
		}
	}

	private renderNavigation(parentEl: HTMLElement, reviewableCount: number): void {
		const navigationEl = parentEl.createDiv({ cls: "mneme-review-navigation" });

		navigationEl.createEl("button", { text: "Previous" }, (buttonEl) => {
			buttonEl.disabled = this.currentIndex === 0;
			buttonEl.addEventListener("click", () => this.moveToPreviousCard());
		});

		navigationEl.createEl("button", { text: "Next" }, (buttonEl) => {
			buttonEl.disabled = this.currentIndex >= reviewableCount;
			buttonEl.addEventListener("click", () => this.advanceToNextCard());
		});
	}

	private renderDiagnostics(): void {
		const diagnosticsEl = this.contentEl.createDiv({ cls: "mneme-review-diagnostics" });

		diagnosticsEl.createEl("h3", { text: "Loaded Card Files" });

		if (this.cards.length === 0) {
			diagnosticsEl.createEl("p", { text: "No Card.md files found." });
			return;
		}

		for (const card of this.cards) {
			this.renderDiagnosticCard(diagnosticsEl, card);
		}
	}

	private renderDiagnosticCard(parentEl: HTMLElement, card: LoadedMnemeCard): void {
		const cardEl = parentEl.createDiv({ cls: "mneme-review-card" });

		cardEl.createEl("h4", { text: card.path });
		cardEl.createEl("p", { text: card.isValid ? "Status: valid" : "Status: invalid" });
		cardEl.createEl("p", { text: `Front: ${card.front || "(empty)"}` });

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

	private showAnswer(): void {
		this.isAnswerShown = true;
		this.statusMessage = "Answer shown.";
		this.render();
	}

	private rateCurrentCard(rating: ReviewRating): void {
		const currentCard = this.getCurrentReviewableCard();

		if (!currentCard) {
			this.statusMessage = "Review complete.";
			this.render();
			return;
		}

		console.info("Mneme: review rating selected", {
			path: currentCard.path,
			rating,
		});

		this.statusMessage = `Recorded ${rating} for ${currentCard.path}.`;
		this.advanceToNextCard();
	}

	private advanceToNextCard(): void {
		const reviewableCards = this.getReviewableCards();

		if (this.currentIndex < reviewableCards.length) {
			this.currentIndex += 1;
		}

		this.isAnswerShown = false;

		if (this.currentIndex >= reviewableCards.length) {
			this.statusMessage = "Review complete.";
		}

		this.render();
	}

	private moveToPreviousCard(): void {
		if (this.currentIndex > 0) {
			this.currentIndex -= 1;
		}

		this.isAnswerShown = false;
		this.statusMessage = "Moved to previous card.";
		this.render();
	}

	private getCurrentReviewableCard(): LoadedMnemeCard | undefined {
		return this.getReviewableCards()[this.currentIndex];
	}

	private getReviewableCards(): LoadedMnemeCard[] {
		return this.cards.filter((card) => card.isValid);
	}
}

function summarizeCards(cards: LoadedMnemeCard[]): CardScanSummary {
	const validCount = cards.filter((card) => card.isValid).length;

	return {
		invalidCount: cards.length - validCount,
		totalCount: cards.length,
		validCount,
	};
}

function formatSummary(summary: CardScanSummary): string {
	return `Scanned ${summary.totalCount} card files, ${summary.validCount} valid, ${summary.invalidCount} invalid.`;
}
