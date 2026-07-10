import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { ConceptMemorySummary } from "../models/conceptMemory";
import { LoadedMnemeCard } from "../models/card";
import { RankedReviewQueueConcept } from "../models/conceptQueue";
import { ConceptLoadSummary, MnemeConcept } from "../models/concept";
import { ReviewQueue, ReviewQueueCard, ReviewQueueConcept } from "../models/reviewQueue";
import {
	CardReviewState,
	CardReviewSuspension,
	CardRetirement,
	ReviewDeferral,
	ReviewRating,
} from "../models/reviewState";
import { DEFAULT_SETTINGS, MnemeSettings } from "../models/settings";
import { CardEditModal } from "../modals/cardEditModal";
import { CardDeleteModal, CardHistoryDeleteModal } from "../modals/cardDeleteModal";
import { CardIdRepairModal } from "../modals/cardIdRepairModal";
import { ConceptLoader } from "../services/conceptLoader";
import { aggregateConceptMemoryById } from "../services/conceptMemoryAggregator";
import { indexRankedConceptsById, rankReviewQueueConcepts } from "../services/conceptQueueRanker";
import { buildReviewQueue } from "../services/reviewQueueBuilder";
import { ReviewStateStore, startOfNextLocalDay } from "../services/reviewStateStore";
import { formatReviewCompletion } from "../services/reviewNavigation";
import {
	buildTodaysFocusUsage,
	selectTodaysFocus,
	TodaysFocusSelection,
} from "../services/todaysFocusSelector";

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
	private activeDeferrals: Record<string, ReviewDeferral> = {};
	private activeRetirements: Record<string, CardRetirement> = {};
	private activeSuspensions: Record<string, CardReviewSuspension> = {};
	private pausedConceptIds = new Set<string>();
	private deferredCardCount = 0;
	private readonly loader: ConceptLoader;
	private isAnswerShown = false;
	private isReviewComplete = false;
	private focusSelection: TodaysFocusSelection = createEmptyFocusSelection();
	private memorySummaries: Record<string, ConceptMemorySummary> = {};
	private mode: ReviewMode = "queue";
	private rankedConceptsById: Record<string, RankedReviewQueueConcept> = {};
	private rankedReviewQueue: RankedReviewQueueConcept[] = [];
	private reviewQueue: ReviewQueue = createEmptyReviewQueue();
	private selectedCardIndex = 0;
	private sessionCardCount = 0;
	private selectedCards: ReviewQueueCard[] = [];
	private selectedConcept: ReviewQueueConcept | null = null;
	private skippedCardCount = 0;
	private shouldRefreshQueueOnBack = false;
	private statusMessage = "Ready to scan Card.md files.";
	private suspendedCardCount = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly reviewStateStore: ReviewStateStore,
		private readonly settingsProvider: () => MnemeSettings = () => DEFAULT_SETTINGS,
	) {
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
			this.activeDeferrals = this.reviewStateStore.getActiveReviewDeferrals(now);
			this.activeRetirements = this.reviewStateStore.getRetiredCards();
			this.activeSuspensions = this.reviewStateStore.getSuspendedCards();
			this.pausedConceptIds = new Set(Object.keys(this.reviewStateStore.getPausedConcepts()));

			this.reviewQueue = buildReviewQueue(loadedConcepts.concepts, reviewStates, now);
			this.memorySummaries = aggregateConceptMemoryById(
				this.reviewQueue.concepts,
				reviewStates,
				now,
				new Set(Object.keys(this.activeRetirements)),
			);
			const rankedReviewQueue = rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries);
			const settings = this.settingsProvider();
			this.focusSelection = selectTodaysFocus(rankedReviewQueue, {
				cardsPerConcept: settings.cardsPerConceptLimit,
				dailyCards: settings.dailyCardLimit,
				dailyConcepts: settings.dailyConceptLimit,
			}, buildTodaysFocusUsage(this.reviewQueue.concepts, reviewStates, now), {
				deferredCardIds: new Set(Object.keys(this.activeDeferrals)),
				pausedConceptIds: this.pausedConceptIds,
				retiredCardIds: new Set(Object.keys(this.activeRetirements)),
				suspendedCardIds: new Set(Object.keys(this.activeSuspensions)),
			});
			this.rankedReviewQueue = this.focusSelection.concepts;
			this.rankedConceptsById = indexRankedConceptsById(rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries, {
				includeNonReviewable: true,
			}));
			this.statusMessage = formatSummary(loadedConcepts.summary);
			this.render();
			new Notice(`Mneme: scanned ${loadedConcepts.summary.scannedCards} card files, ${loadedConcepts.summary.validCards} valid, ${loadedConcepts.summary.invalidCards} invalid.`);
		} catch (error) {
			console.error("Mneme: failed to refresh review concepts", error);
			this.reviewQueue = createEmptyReviewQueue();
			this.memorySummaries = {};
			this.rankedConceptsById = {};
			this.rankedReviewQueue = [];
			this.focusSelection = createEmptyFocusSelection();
			this.activeDeferrals = {};
			this.activeRetirements = {};
			this.activeSuspensions = {};
			this.pausedConceptIds = new Set<string>();
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
		this.renderHeader("Today’s Focus", true);
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
		const summaryEl = this.contentEl.createDiv({ cls: "mneme-review-summary" });

		summaryEl.createEl("span", { text: `${this.focusSelection.selectedCardCount} cards in focus` });
		summaryEl.createEl("span", { text: `${this.focusSelection.concepts.length} concepts` });
		if (this.focusSelection.hiddenCardCount > 0) {
			summaryEl.createEl("span", { text: `${this.focusSelection.hiddenCardCount} available later` });
		}
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
		actionsEl.createEl("button", { text: "Open Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openConceptSource(concept.concept);
			});
		});
		actionsEl.createEl("button", { text: "Pause Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.pauseConcept(concept);
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

		if (this.isReviewComplete) {
			const completion = formatReviewCompletion(
				this.sessionCardCount,
				this.skippedCardCount,
				this.deferredCardCount,
				this.suspendedCardCount,
			);
			cardEl.createEl("p", {
				cls: "mneme-review-card-meta",
				text: completion.label,
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
			actionsEl.createEl("button", { cls: "mneme-review-source-action", text: "Open Concept" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.openConceptSource(concept.concept);
				});
			});
			return;
		}

		if (reviewableCards.length === 0) {
			cardEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No valid cards available for review.",
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
			cls: "mneme-review-card-text",
			text: currentCard.front || "(empty)",
		});

		if (!this.isAnswerShown) {
			const actionsEl = cardEl.createDiv({ cls: "mneme-review-primary-actions" });
			actionsEl.createEl("button", { text: "Show Answer" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.showAnswer());
			});
			this.renderCurrentCardDetails(cardEl, concept, currentQueueCard);
			return;
		}

		cardEl.createDiv({ cls: "mneme-review-answer-separator" });
		cardEl.createEl("div", {
			cls: "mneme-review-card-text",
			text: currentCard.back || "(empty)",
		});

		const ratingsEl = cardEl.createDiv({ cls: "mneme-review-rating-row" });
		for (const rating of REVIEW_RATINGS) {
			ratingsEl.createEl("button", {
				cls: `mneme-review-rating-button mneme-review-rating-${rating.value}`,
				text: rating.label,
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.rateCurrentCard(rating.value, rating.label);
				});
			});
		}

		this.renderCurrentCardDetails(cardEl, concept, currentQueueCard);
	}

	private renderCardManagementActions(
		parentEl: HTMLElement,
		concept: ReviewQueueConcept,
		queueCard: ReviewQueueCard,
	): void {
		parentEl.createEl("button", { text: "Edit" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				new CardEditModal(this.app, {
					card: queueCard.card,
					onSaved: () => this.refreshCards(),
				}).open();
			});
		});
		parentEl.createEl("button", { text: "View Source" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.openReviewSource(concept.concept);
			});
		});
		parentEl.createEl("button", { text: "Skip" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.skipCurrentCard());
		});
		parentEl.createEl("button", { text: "Review Later" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.deferCurrentCard();
			});
		});
		parentEl.createEl("button", { text: "Suspend Card" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.suspendCurrentCard();
			});
		});
		if (queueCard.card.hasExplicitCardId) {
			parentEl.createEl("button", { text: "Retire Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.retireCurrentCard();
				});
			});
			parentEl.createEl("button", { text: "Delete Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					this.openCardDelete(queueCard.card);
				});
			});
		}
	}

	private renderDiagnostics(): void {
		const diagnostics = this.getDiagnosticConcepts();
		const tombstones = Object.values(this.reviewStateStore.getCardTombstones());
		const diagnosticsEl = this.contentEl.createEl("details", {
			cls: "mneme-review-diagnostics",
		});

		diagnosticsEl.createEl("summary", { text: "Advanced Diagnostics" });

		if (diagnostics.length === 0 && tombstones.length === 0) {
			diagnosticsEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No card diagnostics.",
			});
			return;
		}

		for (const concept of diagnostics) {
			this.renderDiagnosticConcept(diagnosticsEl, concept);
		}

		if (tombstones.length > 0) {
			diagnosticsEl.createEl("h4", { text: "Deleted Cards" });
			for (const tombstone of tombstones.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))) {
				const tombstoneEl = diagnosticsEl.createDiv({ cls: "mneme-review-diagnostics-card" });
				tombstoneEl.createEl("p", { text: `Card ID: ${tombstone.cardId}` });
				tombstoneEl.createEl("p", { text: `Deleted at: ${tombstone.deletedAt}` });
				tombstoneEl.createEl("p", { text: `Historical reviews: ${tombstone.reviewCount} · lapses: ${tombstone.lapseCount}` });
				tombstoneEl.createEl("button", { text: "Delete History Too" }, (buttonEl) => {
					buttonEl.addEventListener("click", () => {
						new CardHistoryDeleteModal(this.app, {
							cardId: tombstone.cardId,
							onConfirmed: async (cardId) => {
								await this.reviewStateStore.eraseDeletedCardHistory(cardId);
								this.render();
							},
						}).open();
					});
				});
			}
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

		if (this.pausedConceptIds.has(concept.conceptId)) {
			conceptEl.createEl("p", { text: "Today’s Focus: Paused" });
			conceptEl.createEl("button", { text: "Resume Concept" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.resumeConcept(concept.conceptId);
				});
			});
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
		parentEl.createEl("h5", { text: "Daily Review" });
		parentEl.createEl("p", { text: `Rank: ${rankedConcept ? `#${rankedConcept.rank}` : "(unranked)"}` });
		parentEl.createEl("p", { text: `Review priority: ${formatPriorityBand(memorySummary)} (${formatPercent(memorySummary.reviewPriorityScore)})` });
		parentEl.createEl("p", { text: `Importance: ${memorySummary.importance ?? "normal (default)"}` });
		parentEl.createEl("p", { text: `Review cards: ${memorySummary.reviewCardCount}` });
		parentEl.createEl("p", { text: `Earliest due: ${memorySummary.earliestDueAt ?? "(unset)"}` });
		parentEl.createEl("p", { text: `Next due: ${memorySummary.nextDueAt ?? "(unset)"}` });
		parentEl.createEl("p", { text: `Overdue cards: ${memorySummary.overdueCardCount}` });
		parentEl.createEl("h5", { text: "Diagnostic risk" });
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
			text: `${card.cardId} · ${formatDueStatus(queueCard)} · risk ${cardRisk ? formatPercent(cardRisk.risk) : "(unset)"}`,
		});
		cardEl.createEl("p", { text: `Path: ${card.path}` });
		cardEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		cardEl.createEl("p", { text: `Card index: ${card.cardIndex}` });
		cardEl.createEl("p", { text: `Due status: ${formatDueStatus(queueCard)}` });
		cardEl.createEl("p", { text: `Daily Review: ${queueCard.includedInDailyReview ? "included" : "not included"}` });
		cardEl.createEl("p", { text: `Eligibility: ${formatEligibilityReason(queueCard.eligibilityReason)}` });
		if (queueCard.eligibilityReason === "missing-card-id") {
			cardEl.createEl("p", {
				text: "Assign a stable Card ID before this Card can enter Today’s Focus or FSRS review.",
			});
		}
		cardEl.createEl("p", { text: `Review count: ${queueCard.reviewCount}` });
		cardEl.createEl("p", { text: `Due: ${queueCard.dueAt ?? "(unset)"}` });
		const deferral = this.activeDeferrals[queueCard.cardId];
		if (deferral) {
			cardEl.createEl("p", { text: `Review Later until: ${deferral.resumeAt}` });
		}
		const suspension = this.activeSuspensions[queueCard.cardId];
		if (suspension) {
			cardEl.createEl("p", { text: `Suspended at: ${suspension.suspendedAt}` });
			cardEl.createEl("button", { text: "Resume Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.resumeCard(queueCard.cardId);
				});
			});
		}
		const retirement = this.activeRetirements[queueCard.cardId];
		if (retirement) {
			cardEl.createEl("p", { text: `Retired at: ${retirement.retiredAt}` });
			cardEl.createEl("button", { text: "Restore Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					void this.restoreRetiredCard(queueCard.cardId);
				});
			});
		}
		cardEl.createEl("p", { text: `Risk: ${cardRisk ? formatPercent(cardRisk.risk) : "(unset)"}` });
		cardEl.createEl("p", { text: `Risk source: ${cardRisk?.riskSource ?? "(unset)"}` });
		cardEl.createEl("p", { text: `Retrievability: ${cardRisk?.retrievability === undefined ? "(unset)" : formatPercent(cardRisk.retrievability)}` });
		if (queueCard.reviewCount > 0) {
			const reviewState = this.reviewStateStore.getState(card.cardId);
			this.renderReviewStateDetails(cardEl, reviewState);
		}

		if (canRepairMissingCardSections(card)) {
			cardEl.createEl("button", { text: "Repair Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					new CardEditModal(this.app, {
						card,
						mode: "repair",
						onSaved: () => this.refreshCards(),
					}).open();
				});
			});
		}

		if (canRepairCardId(card)) {
			cardEl.createEl("button", {
				text: card.hasExplicitCardId ? "Replace Duplicate ID" : "Assign Stable ID",
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					new CardIdRepairModal(this.app, {
						card,
						existingCardIds: new Set([
							...getAllCardIds(this.reviewQueue),
							...Object.keys(this.reviewStateStore.getCardTombstones()),
						]),
						onSaved: async (oldCardId, newCardId, migrateState) => {
							if (migrateState) {
								await this.reviewStateStore.rekeyCard(oldCardId, newCardId);
							}
							await this.refreshCards();
						},
					}).open();
				});
			});
		}

		if (card.isValid && card.hasExplicitCardId) {
			cardEl.createEl("button", { text: "Delete Card" }, (buttonEl) => {
				buttonEl.addEventListener("click", () => this.openCardDelete(card));
			});
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
		detailsGridEl.createEl("span", { text: `Review priority ${formatPercent(memorySummary.reviewPriorityScore)}` });
		detailsGridEl.createEl("span", { text: `Importance ${memorySummary.importance ?? "normal"}` });
		detailsGridEl.createEl("span", { text: `${memorySummary.reviewCardCount} review cards` });
		detailsGridEl.createEl("span", { text: `${memorySummary.overdueCardCount} overdue` });
		detailsGridEl.createEl("span", { text: `Next due ${memorySummary.nextDueAt ?? "(unset)"}` });
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
				text: `${card.cardId} · ${formatDueStatus(card)} · ${formatEligibilityReason(card.eligibilityReason)} · ${card.includedInDailyReview ? "Daily Review" : "Later"} · ${formatReviewCount(card.reviewCount)}`,
			});
		}
	}

	private renderCurrentCardDetails(
		parentEl: HTMLElement,
		concept: ReviewQueueConcept,
		queueCard: ReviewQueueCard,
	): void {
		const card = queueCard.card;
		const reviewState = this.reviewStateStore.getState(card.cardId);
		const cardRisk = this.memorySummaries[queueCard.conceptId]?.cardRisks.find((risk) => risk.cardId === queueCard.cardId);
		const detailsEl = parentEl.createEl("details", { cls: "mneme-review-card-details" });

		detailsEl.createEl("summary", { text: "Card details" });
		const actionsEl = detailsEl.createDiv({ cls: "mneme-review-card-management-actions" });
		this.renderCardManagementActions(actionsEl, concept, queueCard);

		if (card.rubric) {
			detailsEl.createEl("h4", { text: "Rubric" });
			detailsEl.createEl("div", {
				cls: "mneme-review-rubric",
				text: card.rubric,
			});
		}

		detailsEl.createEl("p", { text: `Card ID: ${card.cardId}` });
		detailsEl.createEl("p", { text: `Card index: ${card.cardIndex}` });
		detailsEl.createEl("p", { text: `Due status: ${formatDueStatus(queueCard)}` });
		detailsEl.createEl("p", { text: `Daily Review: ${queueCard.includedInDailyReview ? "included" : "not included"}` });
		detailsEl.createEl("p", { text: `Eligibility: ${formatEligibilityReason(queueCard.eligibilityReason)}` });
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
		this.sessionCardCount = this.selectedCards.length;
		this.selectedCardIndex = 0;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.skippedCardCount = 0;
		this.deferredCardCount = 0;
		this.suspendedCardCount = 0;
		this.statusMessage = "Flash card ready.";
		this.render();
	}

	private backToConcepts(): void {
		if (this.shouldRefreshQueueOnBack) {
			void this.refreshCards();
			return;
		}

		this.resetReviewState();
		this.statusMessage = "Back to concepts.";
		this.render();
	}

	private showAnswer(): void {
		this.isAnswerShown = true;
		this.statusMessage = "Answer shown.";
		this.render();
	}

	private skipCurrentCard(): void {
		const card = this.getCurrentReviewableCard();

		if (!card) {
			this.isReviewComplete = true;
			this.statusMessage = "Review complete.";
			this.render();
			return;
		}

		this.skippedCardCount += 1;
		this.advanceToNextCard(`Skipped ${card.cardId}. FSRS state unchanged.`);
	}

	private async deferCurrentCard(): Promise<void> {
		const card = this.getCurrentReviewableCard();

		if (!card) {
			return;
		}

		try {
			const now = new Date();
			const deferral = await this.reviewStateStore.deferReviewUntil(
				card.cardId,
				startOfNextLocalDay(now),
				now,
			);
			this.activeDeferrals[card.cardId] = deferral;
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.deferredCardCount += 1;
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Moved ${card.cardId} out of Today’s Focus until tomorrow.`;
			this.render();
		} catch (error) {
			console.error("Mneme: failed to defer Card review", {
				cardId: card.cardId,
				error,
			});
			new Notice("Mneme: Card could not be moved to Review Later.");
		}
	}

	private async pauseConcept(concept: ReviewQueueConcept): Promise<void> {
		try {
			await this.reviewStateStore.pauseConcept(concept.conceptId);
			new Notice(`Mneme: Paused ${concept.title}.`);
			await this.refreshCards();
		} catch (error) {
			console.error("Mneme: failed to pause Concept", {
				conceptId: concept.conceptId,
				error,
			});
			new Notice("Mneme: Concept could not be paused.");
		}
	}

	private async suspendCurrentCard(): Promise<void> {
		const card = this.getCurrentReviewableCard();

		if (!card) {
			return;
		}

		try {
			const suspension = await this.reviewStateStore.suspendCard(card.cardId);
			this.activeSuspensions[card.cardId] = suspension;
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.suspendedCardCount += 1;
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Suspended ${card.cardId}. FSRS state unchanged.`;
			this.render();
		} catch (error) {
			console.error("Mneme: failed to suspend Card", { cardId: card.cardId, error });
			new Notice("Mneme: Card could not be suspended.");
		}
	}

	private async resumeCard(cardId: string): Promise<void> {
		try {
			await this.reviewStateStore.resumeCard(cardId);
			new Notice("Mneme: Card resumed.");
			await this.refreshCards();
		} catch (error) {
			console.error("Mneme: failed to resume Card", { cardId, error });
			new Notice("Mneme: Card could not be resumed.");
		}
	}

	private async retireCurrentCard(): Promise<void> {
		const card = this.getCurrentReviewableCard();

		if (!card || !card.card.hasExplicitCardId) {
			new Notice("Mneme: assign a stable Card ID before retiring this Card.");
			return;
		}

		try {
			const retirement = await this.reviewStateStore.retireCard(card.cardId);
			this.activeRetirements[card.cardId] = retirement;
			delete this.activeDeferrals[card.cardId];
			delete this.activeSuspensions[card.cardId];
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Retired ${card.cardId}. Markdown and FSRS history preserved.`;
			this.render();
		} catch (error) {
			console.error("Mneme: failed to retire Card", { cardId: card.cardId, error });
			new Notice("Mneme: Card could not be retired.");
		}
	}

	private async restoreRetiredCard(cardId: string): Promise<void> {
		try {
			await this.reviewStateStore.restoreRetiredCard(cardId);
			new Notice("Mneme: Card restored with its existing FSRS history.");
			await this.refreshCards();
		} catch (error) {
			console.error("Mneme: failed to restore retired Card", { cardId, error });
			new Notice("Mneme: Card could not be restored.");
		}
	}

	private openCardDelete(card: LoadedMnemeCard): void {
		new CardDeleteModal(this.app, {
			card,
			onDeleted: async (cardId) => {
				await this.reviewStateStore.deleteCard(cardId);
				void this.refreshCards();
			},
		}).open();
	}

	private async resumeConcept(conceptId: string): Promise<void> {
		try {
			await this.reviewStateStore.resumeConcept(conceptId);
			new Notice("Mneme: Concept resumed.");
			await this.refreshCards();
		} catch (error) {
			console.error("Mneme: failed to resume Concept", { conceptId, error });
			new Notice("Mneme: Concept could not be resumed.");
		}
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

	private async openReviewSource(concept: MnemeConcept): Promise<void> {
		if (!concept.sourcePath) {
			await this.openConceptSource(concept);
			return;
		}

		const sourceFile = this.resolveMarkdownFile(concept.sourcePath, concept.conceptPath ?? "");

		if (!sourceFile) {
			console.warn("Mneme: Source Note path did not resolve to a file", {
				conceptTitle: concept.title,
				sourcePath: concept.sourcePath,
			});
			new Notice("Mneme: Source Note not found. Opening Concept instead.");
			await this.openConceptSource(concept);
			return;
		}

		const existingLeaf = this.findOpenMarkdownLeaf(sourceFile.path);
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
		} else {
			await this.app.workspace.getLeaf("tab").openFile(sourceFile);
		}

		this.statusMessage = `Opened ${sourceFile.basename}.`;
		new Notice(`Opened ${sourceFile.basename}.`);
		this.render();
	}

	private resolveMarkdownFile(linkPath: string, sourcePath: string): TFile | null {
		const direct = this.app.vault.getAbstractFileByPath(linkPath);

		if (direct instanceof TFile) {
			return direct;
		}

		const withExtension = this.app.vault.getAbstractFileByPath(
			/\.md$/i.test(linkPath) ? linkPath : `${linkPath}.md`,
		);

		if (withExtension instanceof TFile) {
			return withExtension;
		}

		return this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
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
		this.sessionCardCount = 0;
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.skippedCardCount = 0;
		this.deferredCardCount = 0;
		this.suspendedCardCount = 0;
		this.shouldRefreshQueueOnBack = false;
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

function formatSummary(loadSummary: ConceptLoadSummary): string {
	return `Scanned ${loadSummary.scannedCards} cards across ${loadSummary.concepts} concepts. Focus is based on priority and today’s limits.`;
}

function createEmptyFocusSelection(): TodaysFocusSelection {
	return {
		concepts: [],
		hiddenCardCount: 0,
		hiddenConceptCount: 0,
		selectedCardCount: 0,
	};
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

	if (concept.concept.importance) {
		metadata.push(`${formatTextLabel(concept.concept.importance)} importance`);
	}

	metadata.push(`${concept.reviewableCount} ${concept.reviewableCount === 1 ? "card" : "cards"}`);

	if (reviewedCount > 0) {
		metadata.push(`${reviewedCount} reviewed`);
	}

	if (warningCount > 0) {
		const warningLabel = warningCount === 1 ? "1 note" : `${warningCount} notes`;
		metadata.push(warningLabel);
	}

	return metadata.join(" · ");
}

function formatTextLabel(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
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

function formatDueStatus(card: ReviewQueueCard): string {
	if (card.eligibilityReason === "missing-card-id") {
		return "needs stable Card ID";
	}

	return card.dueStatus;
}

function formatEligibilityReason(reason: ReviewQueueCard["eligibilityReason"]): string {
	switch (reason) {
		case "new":
			return "New Card";
		case "due":
			return "Due now";
		case "overdue":
			return "Due earlier";
		case "not-due":
			return "Later";
		case "invalid":
			return "Invalid Card";
		case "missing-card-id":
			return "Needs stable Card ID";
		case "missing-due-at":
			return "Missing due date";
		case "exploratory-concept":
			return "Exploratory Concept";
		default:
			return reason;
	}
}

function getConceptIssueCount(concept: MnemeConcept): number {
	return concept.errors.length
		+ concept.warnings.length
		+ concept.cards.reduce((count, card) => count + card.errors.length + card.warnings.length, 0);
}

function canRepairMissingCardSections(card: LoadedMnemeCard): boolean {
	const repairableErrors = new Set([
		"FRONT marker section is required.",
		"BACK marker section is required.",
	]);

	return !card.isValid
		&& card.errors.length > 0
		&& card.errors.every((error) => repairableErrors.has(error));
}

function canRepairCardId(card: LoadedMnemeCard): boolean {
	return (card.isValid && !card.hasExplicitCardId)
		|| card.errors.some((error) => error.startsWith("Duplicate card id:"));
}

function getAllCardIds(queue: ReviewQueue): Set<string> {
	const cardIds = new Set<string>();

	for (const concept of queue.concepts) {
		for (const card of getAllQueueCards(concept)) {
			cardIds.add(card.cardId);
		}
	}

	return cardIds;
}

function getReviewedCardCount(concept: ReviewQueueConcept): number {
	return [
		...concept.dueCards,
		...concept.newCards,
		...concept.notDueCards,
	].filter((card) => card.reviewCount > 0).length;
}
