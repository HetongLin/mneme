import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { CardFileLoader } from "../services/cardFileLoader";

export const REVIEW_VIEW_TYPE = "mneme-review-view";

type ReviewMode = "queue" | "flashcard";
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
	private isAnswerShown = false;
	private isReviewComplete = false;
	private mode: ReviewMode = "queue";
	private selectedCard: LoadedMnemeCard | null = null;
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
		this.resetReviewState();
		this.statusMessage = "Scanning Card.md files...";
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
		const summary = summarizeCards(this.cards);
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${summary.totalCount} scanned` });
		summaryEl.createEl("span", { text: `${summary.validCount} valid` });
		summaryEl.createEl("span", { text: `${summary.invalidCount} invalid` });
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
		const reviewableCards = this.getReviewableCards();

		if (reviewableCards.length === 0) {
			queueEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
			});
			return;
		}

		for (const card of reviewableCards) {
			this.renderQueueItem(queueEl, card);
		}
	}

	private renderQueueItem(parentEl: HTMLElement, card: LoadedMnemeCard): void {
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item" });
		const textEl = itemEl.createDiv();

		textEl.createEl("h3", {
			cls: "mneme-review-queue-title",
			text: getCardTitle(card),
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta",
			text: "1 card",
		});

		const actionsEl = itemEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Flash Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.startFlashCards(card));
		});
		actionsEl.createEl("button", { text: "Source" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.showSourcePlaceholder(card));
		});
	}

	private renderFlashCard(): void {
		const card = this.selectedCard;
		const cardEl = this.contentEl.createDiv({ cls: "mneme-review-card" });

		if (!card) {
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
			});
			return;
		}

		if (this.isReviewComplete) {
			cardEl.createEl("p", {
				cls: "mneme-review-card-meta",
				text: "Card 1 of 1",
			});
			cardEl.createEl("h3", {
				cls: "mneme-review-card-title",
				text: getCardTitle(card),
			});
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "Review complete.",
			});
			return;
		}

		cardEl.createEl("p", {
			cls: "mneme-review-card-meta",
			text: "Card 1 of 1",
		});
		cardEl.createEl("h3", {
			cls: "mneme-review-card-title",
			text: getCardTitle(card),
		});

		cardEl.createEl("div", {
			cls: "mneme-review-front",
			text: card.front || "(empty)",
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
			text: card.back || "(empty)",
		});

		if (card.rubric) {
			cardEl.createEl("div", {
				cls: "mneme-review-rubric",
				text: card.rubric,
			});
		}

		const ratingsEl = cardEl.createDiv({ cls: "mneme-review-rating-row" });
		for (const rating of REVIEW_RATINGS) {
			ratingsEl.createEl("button", { text: rating }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.rateCurrentCard(rating));
			});
		}
	}

	private renderDiagnostics(): void {
		const diagnostics = this.getDiagnosticCards();
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

		for (const card of diagnostics) {
			this.renderDiagnosticCard(diagnosticsEl, card);
		}
	}

	private renderDiagnosticCard(parentEl: HTMLElement, card: LoadedMnemeCard): void {
		const cardEl = parentEl.createDiv({ cls: "mneme-review-diagnostics-item" });

		cardEl.createEl("h4", { text: card.path });
		cardEl.createEl("p", { text: card.isValid ? "Status: valid" : "Status: invalid" });

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

	private startFlashCards(card: LoadedMnemeCard): void {
		this.mode = "flashcard";
		this.selectedCard = card;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.statusMessage = "Flash card ready.";
		this.render();
	}

	private backToQueue(): void {
		this.mode = "queue";
		this.selectedCard = null;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.statusMessage = "Back to review queue.";
		this.render();
	}

	private showAnswer(): void {
		this.isAnswerShown = true;
		this.statusMessage = "Answer shown.";
		this.render();
	}

	private rateCurrentCard(rating: ReviewRating): void {
		const card = this.selectedCard;

		if (!card) {
			this.statusMessage = "Review complete.";
			this.isReviewComplete = true;
			this.render();
			return;
		}

		console.info("Mneme: review rating selected", {
			path: card.path,
			rating,
			title: getCardTitle(card),
		});

		this.statusMessage = `Recorded ${rating}.`;
		this.isAnswerShown = false;
		this.isReviewComplete = true;
		this.render();
	}

	private showSourcePlaceholder(card: LoadedMnemeCard): void {
		console.info("Mneme: source placeholder selected", {
			action: "source",
			path: card.path,
		});
		this.statusMessage = "Source navigation is not implemented yet.";
		new Notice("Source navigation is not implemented yet.");
		this.render();
	}

	private resetReviewState(): void {
		this.mode = "queue";
		this.selectedCard = null;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
	}

	private getReviewableCards(): LoadedMnemeCard[] {
		return this.cards.filter((card) => card.isValid);
	}

	private getDiagnosticCards(): LoadedMnemeCard[] {
		return this.cards.filter((card) => !card.isValid || card.warnings.length > 0);
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

function getCardTitle(card: LoadedMnemeCard): string {
	const parentName = getParentFolderName(card.path);

	return parentName || card.basename || card.path;
}

function getParentFolderName(path: string): string {
	const parts = path.split("/").filter((part) => part.length > 0);

	if (parts.length < 2) {
		return "";
	}

	return parts[parts.length - 2] ?? "";
}
