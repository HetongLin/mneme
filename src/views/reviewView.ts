import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { CardFileLoader } from "../services/cardFileLoader";

export const REVIEW_VIEW_TYPE = "mneme-review-view";

interface CardScanSummary {
	invalidCount: number;
	totalCount: number;
	validCount: number;
}

export class MnemeReviewView extends ItemView {
	private readonly loader: CardFileLoader;
	private listEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;

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
		this.renderSkeleton();
		await this.refreshCards();
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
		this.listEl = null;
		this.statusEl = null;
	}

	private renderSkeleton(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");

		this.contentEl.createEl("h2", { text: "Mneme Review" });

		const controlsEl = this.contentEl.createDiv({ cls: "mneme-review-controls" });
		controlsEl.createEl("button", { text: "Refresh Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.refreshCards();
			});
		});

		this.statusEl = this.contentEl.createDiv({
			cls: "mneme-review-status",
			text: "Scanning Card.md files...",
		});

		this.listEl = this.contentEl.createDiv({ cls: "mneme-review-card-list" });
	}

	private async refreshCards(): Promise<void> {
		this.setStatus("Scanning Card.md files...");

		try {
			const cards = await this.loader.loadCardFiles();
			const summary = summarizeCards(cards);

			this.setStatus(formatSummary(summary));
			this.renderCards(cards);
			new Notice(`Mneme: scanned ${summary.totalCount} card files, ${summary.validCount} valid, ${summary.invalidCount} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review view cards", error);
			this.setStatus("Failed to scan Card.md files. See console for details.");
			this.renderCards([]);
			new Notice("Mneme: failed to scan card files. See console for details.");
		}
	}

	private renderCards(cards: LoadedMnemeCard[]): void {
		if (!this.listEl) {
			return;
		}

		this.listEl.empty();

		if (cards.length === 0) {
			this.listEl.createEl("p", { text: "No Card.md files found." });
			return;
		}

		for (const card of cards) {
			this.renderCard(card);
		}
	}

	private renderCard(card: LoadedMnemeCard): void {
		if (!this.listEl) {
			return;
		}

		const cardEl = this.listEl.createDiv({ cls: "mneme-review-card" });
		cardEl.createEl("h3", { text: card.path });
		cardEl.createEl("p", { text: card.isValid ? "Status: valid" : "Status: invalid" });

		cardEl.createEl("h4", { text: "Front" });
		cardEl.createEl("pre", { text: card.front || "(empty)" });

		if (card.errors.length > 0) {
			this.renderIssueList(cardEl, "Errors", card.errors);
		}

		if (card.warnings.length > 0) {
			this.renderIssueList(cardEl, "Warnings", card.warnings);
		}
	}

	private renderIssueList(parentEl: HTMLElement, label: string, issues: string[]): void {
		parentEl.createEl("h4", { text: label });
		const listEl = parentEl.createEl("ul");

		for (const issue of issues) {
			listEl.createEl("li", { text: issue });
		}
	}

	private setStatus(status: string): void {
		if (this.statusEl) {
			this.statusEl.setText(status);
		}
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
