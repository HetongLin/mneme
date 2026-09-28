import { ObsidianVaultAdapter } from "../services/obsidianVaultAdapter";
import { ItemView, MarkdownRenderer, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
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
import { CardInfoModal, CardInfoRow } from "../modals/cardInfoModal";
import { CardIdRepairModal } from "../modals/cardIdRepairModal";
import { ConceptEditModal } from "../modals/conceptEditModal";
import { ConceptLoader } from "../services/conceptLoader";
import { aggregateConceptMemoryById } from "../services/conceptMemoryAggregator";
import { indexRankedConceptsById, rankReviewQueueConcepts } from "../services/conceptQueueRanker";
import { buildReviewQueue } from "../services/reviewQueueBuilder";
import { ReviewStateStore, startOfNextLocalDay } from "../services/reviewStateStore";
import { formatReviewCompletion } from "../services/reviewNavigation";
import {
	selectNextFocusConcept,
	selectTodaysFocus,
	TodaysFocusSelection,
} from "../services/todaysFocusSelector";
import { formatUserFacingError } from "../utils/userFacingError";
import type { ConceptSummary } from "../models/conceptLibrary";
import { ReviewActionGuard } from "../services/reviewActionGuard";
import { assertReviewRatingSnapshot } from "../services/reviewRatingSnapshot";

export const REVIEW_VIEW_TYPE = "mneme-review-view";

type ReviewMode = "queue" | "flashcard";
type ReviewRatingLabel = "Again" | "Hard" | "Good" | "Easy";
type ReviewSessionSource = "scheduled" | "concept-library";

export interface ReviewViewActions {
	deleteConcept?(concept: ConceptSummary): Promise<void> | void;
	openConceptLibrary?(): Promise<void> | void;
}

interface RefreshCardsOptions {
	preserveCompletedSession?: boolean;
	showNotice?: boolean;
}

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
	private deferredCardCount = 0;
	private deletedCardCount = 0;
	private detailsConceptId: string | null = null;
	private readonly loader: ConceptLoader;
	private readonly actionGuard = new ReviewActionGuard();
	private isAnswerShown = false;
	private isCompletionQueueFresh = false;
	private isReviewComplete = false;
	private focusSelection: TodaysFocusSelection = createEmptyFocusSelection();
	private memorySummaries: Record<string, ConceptMemorySummary> = {};
	private mode: ReviewMode = "queue";
	private rankedConceptsById: Record<string, RankedReviewQueueConcept> = {};
	private rankedReviewQueue: RankedReviewQueueConcept[] = [];
	private reviewQueue: ReviewQueue = createEmptyReviewQueue();
	private selectedCardIndex = 0;
	private sessionCardCount = 0;
	private sessionSource: ReviewSessionSource = "scheduled";
	private selectedCards: ReviewQueueCard[] = [];
	private selectedConcept: ReviewQueueConcept | null = null;
	private skippedCardCount = 0;
	private shouldRefreshQueueOnBack = false;
	private statusMessage = "Ready to scan Card files.";
	private suspendedCardCount = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly reviewStateStore: ReviewStateStore,
		private readonly settingsProvider: () => MnemeSettings = () => DEFAULT_SETTINGS,
		private readonly actions: ReviewViewActions = {},
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
		this.actionGuard.beginSession();
		this.contentEl.empty();
	}

	async refreshCards(options: RefreshCardsOptions = {}): Promise<void> {
		const preserveCompletedSession = options.preserveCompletedSession === true
			&& this.mode === "flashcard"
			&& this.isReviewComplete;

		if (!preserveCompletedSession) {
			this.resetReviewState();
			this.statusMessage = "Scanning Card files...";
			this.render();
		}

		try {
			const loadedConcepts = await this.loader.loadConcepts();
			let restoredLegacyPauses = 0;
			try {
				restoredLegacyPauses = await this.reviewStateStore.clearConceptPauses();
			} catch (error) {
				console.warn("Mneme: could not clear legacy Concept pauses; review will ignore them", error);
			}
			const reviewStates = this.reviewStateStore.getAllStates();
			const now = new Date();
			this.activeDeferrals = this.reviewStateStore.getActiveReviewDeferrals(now);
			this.activeRetirements = this.reviewStateStore.getRetiredCards();
			this.activeSuspensions = this.reviewStateStore.getSuspendedCards();

			this.reviewQueue = buildReviewQueue(loadedConcepts.concepts, reviewStates, now);
			this.memorySummaries = aggregateConceptMemoryById(
				this.reviewQueue.concepts,
				reviewStates,
				now,
				new Set(Object.keys(this.activeRetirements)),
			);
			const rankedReviewQueue = rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries);
			const settings = this.settingsProvider();
			this.focusSelection = selectTodaysFocus(rankedReviewQueue, settings.fsrsEnabled, {
				deferredCardIds: new Set(Object.keys(this.activeDeferrals)),
				retiredCardIds: new Set(Object.keys(this.activeRetirements)),
				suspendedCardIds: new Set(Object.keys(this.activeSuspensions)),
			});
			this.rankedReviewQueue = this.focusSelection.concepts;
			this.rankedConceptsById = indexRankedConceptsById(rankReviewQueueConcepts(this.reviewQueue.concepts, this.memorySummaries, {
				includeNonReviewable: true,
			}));
			const completionStillVisible = preserveCompletedSession
				&& this.mode === "flashcard"
				&& this.isReviewComplete;
			this.statusMessage = completionStillVisible
				? "Review complete. Review schedule updated automatically."
				: formatSummary(loadedConcepts.summary, settings.fsrsEnabled);
			if (completionStillVisible) {
				this.isCompletionQueueFresh = true;
				this.shouldRefreshQueueOnBack = false;
			}
			if (restoredLegacyPauses > 0) {
				new Notice(`Mneme: restored ${restoredLegacyPauses} previously paused ${restoredLegacyPauses === 1 ? "Concept" : "Concepts"}. Card schedules were unchanged.`);
			}
			this.render();
			if (options.showNotice !== false) {
				new Notice(`Mneme: scanned ${loadedConcepts.summary.scannedCards} card files, ${loadedConcepts.summary.validCards} valid, ${loadedConcepts.summary.invalidCards} invalid.`);
			}
		} catch (error) {
			console.error("Mneme: failed to refresh review concepts", error);
			const detail = formatUserFacingError(error, "Try Refresh again.");
			const completionStillVisible = preserveCompletedSession
				&& this.mode === "flashcard"
				&& this.isReviewComplete;
			if (completionStillVisible) {
				this.isCompletionQueueFresh = false;
				this.shouldRefreshQueueOnBack = true;
				this.statusMessage = `Review complete. Automatic refresh failed: ${detail}`;
			} else {
				this.reviewQueue = createEmptyReviewQueue();
				this.memorySummaries = {};
				this.rankedConceptsById = {};
				this.rankedReviewQueue = [];
				this.focusSelection = createEmptyFocusSelection();
				this.activeDeferrals = {};
				this.activeRetirements = {};
				this.activeSuspensions = {};
				this.statusMessage = `Failed to scan Concepts: ${detail}`;
			}
			this.render();
			if (options.showNotice !== false) {
				new Notice(`Mneme: Failed to scan Concepts: ${detail}`);
			}
		}
	}

	/** Re-render the current review presentation without rebuilding session state. */
	refreshPresentation(): void {
		this.render();
	}

	async startConceptReview(conceptId: string): Promise<"started" | "not_found" | "no_reviewable_cards"> {
		await this.refreshCards();
		const concept = this.reviewQueue.concepts.find((queueConcept) => queueConcept.conceptId === conceptId);

		if (!concept) {
			this.statusMessage = "Concept not found in Review.";
			this.render();
			return "not_found";
		}

		if (getConceptReviewCards(concept, this.getExcludedCardIds()).length === 0) {
			this.statusMessage = "No valid Cards are available for this Concept.";
			this.render();
			return "no_reviewable_cards";
		}

		this.startFlashCards(concept, "concept-library");
		return "started";
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");
		this.contentEl.classList.toggle("mneme-review-flashcard-mode", this.mode === "flashcard");

		if (this.mode === "flashcard") {
			this.renderFlashCardMode();
			return;
		}

		this.renderQueueMode();
	}

	private renderQueueMode(): void {
		if (!this.settingsProvider().fsrsEnabled) {
			this.renderHeader("Scheduled review is off", true);
			this.renderSchedulingDisabled();
			return;
		}

		this.renderHeader("Today’s Focus", true);
		this.renderSummary();
		this.renderQueue();
		if (this.settingsProvider().showAdvancedDiagnostics) {
			this.renderDiagnostics();
		}
	}

	private renderFlashCardMode(): void {
		this.renderHeader(this.sessionSource === "concept-library" ? "Concept Review" : "Today’s Focus Review", false);
		this.renderStatus();
		const stageEl = this.contentEl.createDiv({ cls: "mneme-review-study-stage" });
		this.renderFlashCard(stageEl);
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
			toolbarEl.createEl("button", { text: this.sessionSource === "concept-library" ? "Back to Concept Library" : "Back to Today’s Focus" }, (buttonEl) => {
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
		this.renderStatus();
	}

	private renderSchedulingDisabled(): void {
		const emptyEl = this.contentEl.createDiv({ cls: "mneme-review-queue" });
		emptyEl.createEl("p", {
			cls: "mneme-review-empty",
			text: "Today’s Focus is hidden.",
		});
		emptyEl.createEl("p", {
			cls: "mneme-review-status",
			text: "Mneme will not show a scheduled due-card queue while Scheduled Review is off. Manual Concept Review from Concept Library still updates Card memory.",
		});
		const actionsEl = emptyEl.createDiv({ cls: "mneme-review-actions" });
		actionsEl.createEl("button", { text: "Open Concept Library" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				void this.actions.openConceptLibrary?.();
			});
		});
	}

	private renderStatus(): void {
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.statusMessage,
		});
	}

	private renderQueue(): void {
		const reviewableConcepts = this.rankedReviewQueue;
		const detailsConcept = this.detailsConceptId
			? reviewableConcepts.find((concept) => concept.concept.conceptId === this.detailsConceptId)
			: undefined;
		if (this.detailsConceptId && !detailsConcept) {
			this.detailsConceptId = null;
		}
		const layoutEl = this.contentEl.createDiv({
			cls: `mneme-review-queue-layout${detailsConcept ? " has-inspector" : ""}`,
		});
		const queueEl = layoutEl.createDiv({ cls: "mneme-review-queue mneme-review-concept-grid" });
		queueEl.addEventListener("click", (event) => {
			if (this.detailsConceptId && event.target === queueEl) {
				this.detailsConceptId = null;
				this.render();
			}
		});

		if (reviewableConcepts.length === 0) {
			queueEl.createEl("p", {
				cls: "mneme-review-empty",
				text: "No cards due right now.",
			});
			if (this.settingsProvider().showAdvancedDiagnostics) {
				queueEl.createEl("p", {
					cls: "mneme-review-status",
					text: "Use Advanced Diagnostics to inspect future cards.",
				});
			}
			return;
		}

		for (const concept of reviewableConcepts) {
			this.renderConceptQueueItem(queueEl, concept);
		}

		if (detailsConcept) {
			this.renderConceptInspector(layoutEl, detailsConcept);
		}
	}

	private renderConceptQueueItem(parentEl: HTMLElement, rankedConcept: RankedReviewQueueConcept): void {
		const concept = rankedConcept.concept;
		const itemEl = parentEl.createDiv({ cls: "mneme-review-queue-item mneme-review-concept" });
		const mainEl = itemEl.createDiv({ cls: "mneme-review-queue-main" });
		const textEl = mainEl.createDiv({ cls: "mneme-review-concept-card-content" });
		const warningCount = getConceptIssueCount(concept.concept);
		const reviewedCount = getReviewedCardCount(concept);
		const titleRowEl = textEl.createDiv({ cls: "mneme-review-concept-title-row" });

		titleRowEl.createEl("h3", {
			cls: "mneme-review-queue-title mneme-review-concept-title",
			text: concept.title,
		});
		const detailsButton = titleRowEl.createEl("button", {
			cls: `mneme-review-concept-info-button${this.detailsConceptId === concept.conceptId ? " is-active" : ""}`,
			attr: {
				"aria-label": `Show details for ${concept.title}`,
				title: "Concept details",
			},
		});
		setIcon(detailsButton, "info");
		detailsButton.addEventListener("click", () => {
			this.detailsConceptId = this.detailsConceptId === concept.conceptId ? null : concept.conceptId;
			this.render();
		});
		textEl.createEl("p", {
			cls: "mneme-review-queue-meta mneme-review-concept-meta",
			text: formatConceptMeta(concept, rankedConcept, warningCount, reviewedCount),
		});

		const actionsEl = mainEl.createDiv({ cls: "mneme-review-actions" });

		actionsEl.createEl("button", { text: "Flash Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.startFlashCards(concept));
		});
		actionsEl.createEl("button", { text: "View Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.viewConcept(concept.concept);
			});
		});
	}

	private renderConceptInspector(parentEl: HTMLElement, rankedConcept: RankedReviewQueueConcept): void {
		const concept = rankedConcept.concept;
		const memorySummary = this.memorySummaries[concept.conceptId];
		const inspectorEl = parentEl.createEl("aside", {
			cls: "mneme-review-concept-inspector",
			attr: {
				"aria-label": `Details for ${concept.title}`,
			},
		});
		const headerEl = inspectorEl.createDiv({ cls: "mneme-review-inspector-header" });
		const headingEl = headerEl.createDiv();
		headingEl.createEl("p", { cls: "mneme-review-inspector-eyebrow", text: "Concept Details" });
		headingEl.createEl("h3", { cls: "mneme-review-inspector-title", text: concept.title });
		const closeButton = headerEl.createEl("button", {
			cls: "mneme-review-inspector-close",
			attr: {
				"aria-label": "Close Concept details",
				title: "Close",
			},
		});
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", () => {
			this.detailsConceptId = null;
			this.render();
		});

		const overviewEl = inspectorEl.createEl("section", { cls: "mneme-review-inspector-section" });
		overviewEl.createEl("h4", { text: "Overview" });
		const statsEl = overviewEl.createDiv({ cls: "mneme-review-inspector-stats" });
		this.renderInspectorStat(statsEl, "Rank", `#${rankedConcept.rank}`);
		this.renderInspectorStat(statsEl, "Review priority", formatPercent(rankedConcept.reviewPriorityScore));
		this.renderInspectorStat(
			statsEl,
			"Retention target",
			concept.concept.retentionTarget === undefined
				? `${this.settingsProvider().fsrsRequestRetention.toFixed(2)} · Global`
				: `${concept.concept.retentionTarget.toFixed(2)} · Concept`,
		);
		this.renderInspectorStat(statsEl, "Next due", memorySummary?.nextDueAt ?? "Unset");
		this.renderInspectorStat(statsEl, "Overdue", String(memorySummary?.overdueCardCount ?? 0));
		this.renderInspectorStat(statsEl, "New", String(memorySummary?.newCardCount ?? concept.newCards.length));

		const coverageEl = inspectorEl.createEl("section", { cls: "mneme-review-inspector-section" });
		coverageEl.createEl("h4", { text: "Coverage" });
		const coverageChipsEl = coverageEl.createDiv({ cls: "mneme-review-inspector-chips" });
		if (!memorySummary || memorySummary.coveredCardTypes.length === 0) {
			coverageChipsEl.createEl("span", {
				cls: "mneme-review-inspector-empty",
				text: "No valid assessment probes",
			});
		} else {
			for (const cardType of memorySummary.coveredCardTypes) {
				coverageChipsEl.createEl("span", {
					cls: "mneme-review-inspector-chip",
					text: formatTextLabel(cardType),
				});
			}
		}

		const cardsEl = inspectorEl.createEl("section", {
			cls: "mneme-review-inspector-section mneme-review-inspector-card-section",
		});
		cardsEl.createEl("h4", { text: "Card Status" });
		this.renderInspectorCardStatuses(cardsEl, concept);
	}

	private renderInspectorStat(parentEl: HTMLElement, label: string, value: string): void {
		const statEl = parentEl.createDiv({ cls: "mneme-review-inspector-stat" });
		statEl.createEl("span", { cls: "mneme-review-inspector-stat-label", text: label });
		statEl.createEl("strong", { text: value });
	}

	private renderInspectorCardStatuses(parentEl: HTMLElement, concept: ReviewQueueConcept): void {
		const cards = getAllQueueCards(concept);
		if (cards.length === 0) {
			parentEl.createEl("p", { cls: "mneme-review-inspector-empty", text: "No Cards found." });
			return;
		}

		const listEl = parentEl.createEl("ul", { cls: "mneme-review-inspector-card-list" });
		for (const card of cards) {
			const itemEl = listEl.createEl("li");
			itemEl.createEl("strong", { text: card.cardId });
			itemEl.createEl("span", {
				text: `${formatInspectorCardStatus(card)} · ${formatReviewCount(card.reviewCount)}`,
			});
		}
	}

	private renderFlashCard(parentEl: HTMLElement): void {
		const concept = this.selectedConcept;
		const cardEl = parentEl.createDiv({ cls: "mneme-review-card" });

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
				this.deletedCardCount,
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
			const nextFocusConcept = this.sessionSource === "scheduled" && this.isCompletionQueueFresh
				? selectNextFocusConcept(this.focusSelection, concept.conceptId)
				: undefined;
			if (this.sessionSource === "scheduled" && this.isCompletionQueueFresh && !nextFocusConcept) {
				cardEl.createEl("p", {
					cls: "mneme-review-status",
					text: "Today’s Focus is complete.",
				});
			}
			this.renderReviewCompletionActionBar(this.contentEl, concept, nextFocusConcept);
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

		this.renderCardMarkdown(cardEl, currentCard.front || "(empty)", currentCard, "mneme-review-card-text");

		if (!this.isAnswerShown) {
			this.renderReviewActionBar(this.contentEl, concept, currentQueueCard);
			return;
		}

		cardEl.createDiv({ cls: "mneme-review-answer-separator" });
		this.renderCardMarkdown(cardEl, currentCard.back || "(empty)", currentCard, "mneme-review-card-text");

		this.renderReviewActionBar(this.contentEl, concept, currentQueueCard);
	}

	private renderReviewActionBar(
		parentEl: HTMLElement,
		concept: ReviewQueueConcept,
		queueCard: ReviewQueueCard,
	): void {
		const actionBarEl = parentEl.createDiv({ cls: "mneme-review-action-bar" });
		const leftEl = actionBarEl.createDiv({ cls: "mneme-review-action-bar-edge" });
		leftEl.createEl("button", { text: "Edit" }, (buttonEl) => {
			buttonEl.disabled = this.actionGuard.isBusy;
			buttonEl.addEventListener("click", () => this.openCardEditor(queueCard.card));
		});

		const primaryEl = actionBarEl.createDiv({ cls: "mneme-review-action-bar-primary" });
		if (!this.isAnswerShown) {
			primaryEl.createEl("button", {
				cls: "mneme-review-show-answer-button",
				text: "Show Answer",
			}, (buttonEl) => {
				buttonEl.disabled = this.actionGuard.isBusy;
				buttonEl.addEventListener("click", () => this.showAnswer());
			});
		} else {
			for (const rating of REVIEW_RATINGS) {
				primaryEl.createEl("button", {
					cls: `mneme-review-rating-button mneme-review-rating-${rating.value}`,
					text: rating.label,
				}, (buttonEl) => {
					buttonEl.disabled = this.actionGuard.isBusy;
					buttonEl.addEventListener("click", () => {
						void this.rateCurrentCard(rating.value);
					});
				});
			}
		}

		const rightEl = actionBarEl.createDiv({ cls: "mneme-review-action-bar-edge mneme-review-action-bar-end" });
		rightEl.createEl("button", { text: "More ▾" }, (buttonEl) => {
			buttonEl.disabled = this.actionGuard.isBusy;
			buttonEl.addEventListener("click", () => {
				this.openCardActionsMenu(buttonEl, concept, queueCard);
			});
		});
	}

	private renderReviewCompletionActionBar(
		parentEl: HTMLElement,
		concept: ReviewQueueConcept,
		nextFocusConcept: RankedReviewQueueConcept | undefined,
	): void {
		const actionBarEl = parentEl.createDiv({ cls: "mneme-review-action-bar" });
		const leftEl = actionBarEl.createDiv({ cls: "mneme-review-action-bar-edge" });
		leftEl.createEl("button", { text: "View Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => this.viewConcept(concept.concept));
		});

		const primaryEl = actionBarEl.createDiv({ cls: "mneme-review-action-bar-primary" });
		if (nextFocusConcept) {
			primaryEl.createEl("button", {
				cls: "mneme-review-completion-primary",
				text: "Review Next Concept",
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => {
					this.startFlashCards(nextFocusConcept.concept, "scheduled");
				});
			});
		}

		actionBarEl.createDiv({ cls: "mneme-review-action-bar-edge mneme-review-action-bar-end" });
	}

	private renderCardMarkdown(
		parentEl: HTMLElement,
		markdown: string,
		card: LoadedMnemeCard,
		className: string,
	): void {
		const markdownEl = parentEl.createDiv({ cls: `${className} mneme-markdown-content` });
		markdownEl.addEventListener("click", (event) => {
			if (!isRenderedMathTarget(event.target)) return;
			event.preventDefault();
			event.stopPropagation();
			this.openCardEditor(card);
		});
		void MarkdownRenderer.render(this.app, markdown, markdownEl, card.path, this)
			.then(() => markRenderedMathEditable(markdownEl))
			.catch((error) => {
				console.error("Mneme: failed to render Card Markdown", error);
				markdownEl.empty();
				markdownEl.setText(markdown);
			});
	}

	private openCardEditor(card: LoadedMnemeCard): void {
		new CardEditModal(this.app, {
			card,
			onSaved: () => this.refreshEditedCard(card.cardId),
		}).open();
	}

	private async refreshEditedCard(cardId: string): Promise<void> {
		const conceptId = this.selectedConcept?.conceptId;
		const selectedCardIds = this.selectedCards.map((queueCard) => queueCard.cardId);
		const currentCardId = this.getCurrentReviewableCard()?.cardId;

		if (this.mode !== "flashcard" || !conceptId || !currentCardId) {
			await this.refreshCards({ showNotice: false });
			return;
		}

		const loadedConcepts = await this.loader.loadConcepts();
		const refreshedQueue = buildReviewQueue(
			loadedConcepts.concepts,
			this.reviewStateStore.getAllStates(),
			new Date(),
		);
		const refreshedConcept = refreshedQueue.concepts.find((concept) => concept.conceptId === conceptId);

		if (!refreshedConcept) {
			throw new Error("The Concept containing this Card is no longer available.");
		}

		const refreshedCardsById = new Map(
			getAllQueueCards(refreshedConcept).map((queueCard) => [queueCard.cardId, queueCard]),
		);
		const refreshedCurrentCard = refreshedCardsById.get(cardId);

		if (!refreshedCurrentCard?.card.isValid) {
			throw new Error("The saved Card is no longer valid for review.");
		}

		const refreshedSelectedCards = selectedCardIds
			.map((selectedCardId) => refreshedCardsById.get(selectedCardId))
			.filter((queueCard): queueCard is ReviewQueueCard => queueCard?.card.isValid === true);
		const refreshedCardIndex = refreshedSelectedCards.findIndex((queueCard) => queueCard.cardId === currentCardId);

		if (refreshedCardIndex < 0) {
			throw new Error("The current Card could not be restored after saving.");
		}

		this.reviewQueue = refreshedQueue;
		this.selectedConcept = refreshedConcept;
		this.selectedCards = refreshedSelectedCards;
		this.selectedCardIndex = refreshedCardIndex;
		this.shouldRefreshQueueOnBack = true;
		this.statusMessage = "Card updated. Review position preserved.";
		this.render();
	}

	private openCardActionsMenu(
		anchorEl: HTMLElement,
		concept: ReviewQueueConcept,
		queueCard: ReviewQueueCard,
	): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item
				.setTitle("View Concept")
				.setIcon("book-open")
				.onClick(() => this.viewConcept(concept.concept));
		});
		menu.addItem((item) => {
			item
				.setTitle("Skip for Now")
				.setIcon("skip-forward")
				.onClick(() => this.skipCurrentCard());
		});
		menu.addItem((item) => {
			item
				.setTitle("Review Tomorrow")
				.setIcon("calendar-clock")
				.onClick(() => {
					void this.deferCurrentCard();
				});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle("Suspend Card")
				.setIcon("pause")
				.onClick(() => {
					void this.suspendCurrentCard();
				});
		});

		if (queueCard.card.hasExplicitCardId) {
			menu.addItem((item) => {
				item
					.setTitle("Archive Card")
					.setIcon("archive")
					.onClick(() => {
						void this.retireCurrentCard();
					});
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle("Card Info")
				.setIcon("info")
				.onClick(() => this.openCardInfo(concept, queueCard));
		});
		if (queueCard.card.hasExplicitCardId) {
			menu.addItem((item) => {
				item
					.setTitle("Delete Card…")
					.setIcon("trash-2")
					.setWarning(true)
					.onClick(() => this.openCardDelete(queueCard.card, true));
			});
		}

		const anchorRect = anchorEl.getBoundingClientRect();
		menu.showAtPosition({
			overlap: false,
			width: anchorRect.width,
			x: anchorRect.left,
			y: anchorRect.top,
		}, anchorEl.ownerDocument);
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

		conceptEl.createEl("p", {
			text: formatRetentionPolicy(
				concept.concept.retentionTarget,
				this.settingsProvider().fsrsRequestRetention,
			),
		});

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
		parentEl.createEl("h5", { text: "FSRS Review" });
		parentEl.createEl("p", { text: `Rank: ${rankedConcept ? `#${rankedConcept.rank}` : "(unranked)"}` });
		parentEl.createEl("p", { text: `Review priority: ${formatPriorityBand(memorySummary)} (${formatPercent(memorySummary.reviewPriorityScore)})` });
		parentEl.createEl("p", { text: `Importance: ${memorySummary.importance ?? "normal (default)"}` });
		parentEl.createEl("p", { text: `Review cards: ${memorySummary.reviewCardCount}` });
		parentEl.createEl("p", { text: `Assessment coverage: ${formatAssessmentCoverage(memorySummary)}` });
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
		cardEl.createEl("p", { text: `FSRS eligibility: ${queueCard.includedInDailyReview ? "eligible" : "not eligible"}` });
		cardEl.createEl("p", { text: `Eligibility: ${formatEligibilityReason(queueCard.eligibilityReason)}` });
		if (queueCard.eligibilityReason === "missing-card-id") {
			cardEl.createEl("p", {
				text: "Assign a stable Card ID before this Card can enter FSRS review.",
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
			cardEl.createEl("p", { text: `Archived at: ${retirement.retiredAt}` });
			cardEl.createEl("button", { text: "Restore Archived Card" }, (buttonEl) => {
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
						onConfirmed: (newCardId) => this.reviewStateStore.repairCardId(card, newCardId, new ObsidianVaultAdapter(this.app.vault)),
						onSaved: async () => {
							await this.reviewStateStore.load();
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

	private openCardInfo(
		concept: ReviewQueueConcept,
		queueCard: ReviewQueueCard,
	): void {
		const card = queueCard.card;
		const reviewState = this.reviewStateStore.getState(card.cardId);
		const cardRisk = this.memorySummaries[queueCard.conceptId]?.cardRisks.find((risk) => risk.cardId === queueCard.cardId);
		const rows: CardInfoRow[] = [
			{ label: "Card ID", value: card.cardId },
			{ label: "Card index", value: String(card.cardIndex) },
			{ label: "Card type", value: card.cardType ?? "(unset)" },
			{ label: "Due status", value: formatDueStatus(queueCard) },
			{ label: "FSRS eligibility", value: queueCard.includedInDailyReview ? "eligible" : "not eligible" },
			{ label: "Eligibility", value: formatEligibilityReason(queueCard.eligibilityReason) },
			{ label: "Review count", value: String(reviewState?.reviewCount ?? queueCard.reviewCount) },
			{ label: "Last rating", value: reviewState?.lastRating ?? "(none)" },
			{ label: "Due", value: reviewState?.dueAt ?? queueCard.dueAt ?? "(unset)" },
			{ label: "Risk source", value: cardRisk?.riskSource ?? "(unset)" },
			{ label: "Retrievability", value: cardRisk?.retrievability === undefined ? "(unset)" : formatPercent(cardRisk.retrievability) },
		];

		if (reviewState) {
			rows.push(
				{ label: "Scheduler", value: reviewState.scheduler ?? "(unset)" },
				{ label: "FSRS state", value: reviewState.fsrsState ?? "(unset)" },
				{ label: "Stability", value: formatOptionalNumber(reviewState.stability) },
				{ label: "Difficulty", value: formatOptionalNumber(reviewState.difficulty) },
				{ label: "Scheduled days", value: formatOptionalNumber(reviewState.scheduledDays) },
				{ label: "Learning step", value: formatOptionalNumber(reviewState.learningSteps) },
			);
		}

		new CardInfoModal(this.app, {
			card,
			conceptTitle: concept.title,
			rows,
		}).open();
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

	private startFlashCards(concept: ReviewQueueConcept, source: ReviewSessionSource = "scheduled"): void {
		if (source === "scheduled" && !this.settingsProvider().fsrsEnabled) {
			new Notice("Mneme: Scheduled Review is off.");
			return;
		}

		const selectedCards = source === "concept-library"
			? getConceptReviewCards(concept, this.getExcludedCardIds())
			: getQueuedReviewCards(concept);

		if (selectedCards.length === 0) {
			new Notice(source === "concept-library"
				? "Mneme: no valid Cards are available for this Concept."
				: "Mneme: no due or new Cards are available for this Concept.");
			return;
		}

		this.actionGuard.beginSession();
		this.mode = "flashcard";
		this.sessionSource = source;
		this.selectedConcept = concept;
		this.selectedCards = selectedCards;
		this.sessionCardCount = this.selectedCards.length;
		this.selectedCardIndex = 0;
		this.isAnswerShown = false;
		this.isCompletionQueueFresh = false;
		this.isReviewComplete = false;
		this.skippedCardCount = 0;
		this.deferredCardCount = 0;
		this.suspendedCardCount = 0;
		this.deletedCardCount = 0;
		this.statusMessage = "Flash card ready.";
		this.render();
	}

	private backToConcepts(): void {
		const shouldOpenConceptLibrary = this.sessionSource === "concept-library";
		if (this.shouldRefreshQueueOnBack) {
			void this.refreshCards().then(() => {
				if (shouldOpenConceptLibrary) void this.actions.openConceptLibrary?.();
			});
			return;
		}

		this.resetReviewState();
		this.statusMessage = "Back to concepts.";
		this.render();
		if (shouldOpenConceptLibrary) void this.actions.openConceptLibrary?.();
	}

	private showAnswer(): void {
		this.isAnswerShown = true;
		this.statusMessage = "Answer shown.";
		this.render();
	}

	private skipCurrentCard(): void {
		if (this.actionGuard.isBusy) return;
		const card = this.getCurrentReviewableCard();

		if (!card) {
			this.isReviewComplete = true;
			this.statusMessage = "Review complete.";
			this.render();
			void this.refreshCompletedReviewSession();
			return;
		}

		this.skippedCardCount += 1;
		if (this.advanceToNextCard()) {
			void this.refreshCompletedReviewSession();
		}
	}

	private async deferCurrentCard(): Promise<void> {
		const card = this.getCurrentReviewableCard();

		if (!card) {
			return;
		}
		const action = this.actionGuard.begin("more", card.cardId);
		if (!action) return;
		this.setReviewActionButtonsDisabled(true);

		try {
			const now = new Date();
			const deferral = await this.reviewStateStore.deferReviewUntil(
				card.cardId,
				startOfNextLocalDay(now),
				now,
			);
			if (!this.actionGuard.isCurrent(action)) return;
			this.activeDeferrals[card.cardId] = deferral;
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.deferredCardCount += 1;
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Moved ${card.cardId} out of review until tomorrow.`;
			if (this.isReviewComplete) {
				await this.refreshCompletedReviewSession();
			} else {
				this.render();
			}
		} catch (error) {
			if (!this.actionGuard.isCurrent(action)) return;
			console.error("Mneme: failed to defer Card review", {
				cardId: card.cardId,
				error,
			});
			new Notice("Mneme: Card could not be moved to tomorrow.");
		} finally {
			this.actionGuard.finish(action);
			this.setReviewActionButtonsDisabled(false);
		}
	}

	private async suspendCurrentCard(): Promise<void> {
		const card = this.getCurrentReviewableCard();

		if (!card) {
			return;
		}
		const action = this.actionGuard.begin("more", card.cardId);
		if (!action) return;
		this.setReviewActionButtonsDisabled(true);

		try {
			const suspension = await this.reviewStateStore.suspendCard(card.cardId);
			if (!this.actionGuard.isCurrent(action)) return;
			this.activeSuspensions[card.cardId] = suspension;
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.suspendedCardCount += 1;
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Suspended ${card.cardId}. FSRS state unchanged.`;
			if (this.isReviewComplete) {
				await this.refreshCompletedReviewSession();
			} else {
				this.render();
			}
		} catch (error) {
			if (!this.actionGuard.isCurrent(action)) return;
			console.error("Mneme: failed to suspend Card", { cardId: card.cardId, error });
			new Notice("Mneme: Card could not be suspended.");
		} finally {
			this.actionGuard.finish(action);
			this.setReviewActionButtonsDisabled(false);
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
			new Notice("Mneme: assign a stable Card ID before archiving this Card.");
			return;
		}
		const action = this.actionGuard.begin("more", card.cardId);
		if (!action) return;
		this.setReviewActionButtonsDisabled(true);

		try {
			const retirement = await this.reviewStateStore.retireCard(card.cardId);
			if (!this.actionGuard.isCurrent(action)) return;
			this.activeRetirements[card.cardId] = retirement;
			delete this.activeDeferrals[card.cardId];
			delete this.activeSuspensions[card.cardId];
			this.selectedCards.splice(this.selectedCardIndex, 1);
			this.isAnswerShown = false;
			this.shouldRefreshQueueOnBack = true;

			if (this.selectedCardIndex >= this.selectedCards.length) {
				this.isReviewComplete = true;
			}

			this.statusMessage = `Archived ${card.cardId}. Markdown and FSRS history preserved.`;
			if (this.isReviewComplete) {
				await this.refreshCompletedReviewSession();
			} else {
				this.render();
			}
		} catch (error) {
			if (!this.actionGuard.isCurrent(action)) return;
			console.error("Mneme: failed to archive Card", { cardId: card.cardId, error });
			new Notice("Mneme: Card could not be archived.");
		} finally {
			this.actionGuard.finish(action);
			this.setReviewActionButtonsDisabled(false);
		}
	}

	private async restoreRetiredCard(cardId: string): Promise<void> {
		try {
			await this.reviewStateStore.restoreRetiredCard(cardId);
			new Notice("Mneme: Card restored with its existing FSRS history.");
			await this.refreshCards();
		} catch (error) {
			console.error("Mneme: failed to restore archived Card", { cardId, error });
			new Notice("Mneme: Card could not be restored.");
		}
	}

	private openCardDelete(card: LoadedMnemeCard, preserveReviewSession = false): void {
		new CardDeleteModal(this.app, {
			card,
			onConfirmed: () => this.reviewStateStore.deleteCardFromMarkdown(card, new ObsidianVaultAdapter(this.app.vault)),
			onDeleted: async (cardId) => {
				await this.reviewStateStore.load();
				if (preserveReviewSession) {
					await this.removeDeletedCardFromReview(cardId);
					return;
				}
				await this.refreshCards();
			},
		}).open();
	}

	private async removeDeletedCardFromReview(cardId: string): Promise<void> {
		const deletedIndex = this.selectedCards.findIndex((card) => card.cardId === cardId);

		if (this.mode !== "flashcard" || deletedIndex !== this.selectedCardIndex) {
			await this.refreshCards({ showNotice: false });
			return;
		}

		this.selectedCards.splice(deletedIndex, 1);
		this.deletedCardCount += 1;
		this.isAnswerShown = false;
		this.shouldRefreshQueueOnBack = true;

		if (this.selectedCardIndex >= this.selectedCards.length) {
			this.isReviewComplete = true;
			this.statusMessage = "Review complete.";
			await this.refreshCompletedReviewSession();
			return;
		}

		this.statusMessage = "Card deleted. Next card ready.";
		this.render();
	}

	private async rateCurrentCard(rating: ReviewRating): Promise<void> {
		const concept = this.selectedConcept;
		const card = this.getCurrentReviewableCard();

		if (!concept || !card) {
			this.statusMessage = "Review complete.";
			this.isReviewComplete = true;
			this.render();
			await this.refreshCompletedReviewSession();
			return;
		}
		const action = this.actionGuard.begin("rating", card.cardId);
		if (!action) return;
		this.setReviewActionButtonsDisabled(true);

		try {
			let updatedReviewState: CardReviewState;
			try {
				const current = await this.loader.loadConcepts();
				// Closing, refreshing, or replacing the selection while the scan is
				// pending must cancel the old action before it starts a state write.
				if (!this.actionGuard.isCurrent(action)
					|| this.selectedConcept !== concept
					|| this.getCurrentReviewableCard() !== card) return;
				assertReviewRatingSnapshot(concept.concept, card.card, current.concepts);
				updatedReviewState = await this.reviewStateStore.recordReview(card.cardId, rating, {
					requestRetention: concept.concept.retentionTarget,
				});
			} catch (error) {
				if (!this.actionGuard.isCurrent(action)) return;
				console.error("Mneme: failed to record review rating", {
					cardId: card.cardId,
					conceptTitle: concept.title,
					error,
					rating,
				});
				const detail = formatUserFacingError(error, "Try the rating again.");
				this.statusMessage = `Could not record review: ${detail}`;
				new Notice(`Mneme: Could not record review: ${detail}`);
				this.render();
				return;
			}
			if (!this.actionGuard.isCurrent(action)) return;

			console.info("Mneme: review rating selected", {
				cardId: card.cardId,
				cardIndex: this.selectedCardIndex + 1,
				conceptTitle: concept.title,
				path: card.card.path,
				rating,
				updatedReviewState,
			});
			if (this.advanceToNextCard()) {
				await this.refreshCompletedReviewSession();
			}
		} finally {
			this.actionGuard.finish(action);
			this.setReviewActionButtonsDisabled(false);
		}
	}

	private advanceToNextCard(): boolean {
		this.isAnswerShown = false;
		this.isCompletionQueueFresh = false;

		if (this.selectedCardIndex + 1 < this.selectedCards.length) {
			this.selectedCardIndex += 1;
			this.statusMessage = "Flash card ready.";
		} else {
			this.isReviewComplete = true;
			this.statusMessage = "Review complete.";
		}

		this.render();
		return this.isReviewComplete;
	}

	private async refreshCompletedReviewSession(): Promise<void> {
		this.isCompletionQueueFresh = false;
		this.statusMessage = "Review complete. Updating review schedule...";
		this.render();
		await this.refreshCards({
			preserveCompletedSession: true,
			showNotice: false,
		});
	}

	private viewConcept(concept: MnemeConcept): void {
		const conceptSummary = this.toConceptSummary(concept);
		if (!conceptSummary) {
			new Notice("No Concept found for this concept.");
			return;
		}

		new ConceptEditModal(this.app, {
			concept: conceptSummary,
			deleteConcept: this.actions.deleteConcept
				? () => this.actions.deleteConcept?.(conceptSummary)
				: undefined,
			globalRetentionTarget: this.settingsProvider().fsrsRequestRetention,
			onSaved: () => this.refreshCards(),
		}).open();
	}

	private toConceptSummary(concept: MnemeConcept): ConceptSummary | undefined {
		if (!concept.conceptPath) {
			return undefined;
		}

		return {
			cardCount: concept.cards.length,
			cardsPath: concept.cardPath,
			conceptId: concept.id,
			importance: concept.importance,
			learningMode: concept.learningMode,
			path: concept.conceptPath,
			retentionTarget: concept.retentionTarget,
			title: concept.title,
		};
	}

	private resetReviewState(): void {
		this.actionGuard.beginSession();
		this.mode = "queue";
		this.detailsConceptId = null;
		this.selectedConcept = null;
		this.selectedCards = [];
		this.selectedCardIndex = 0;
		this.sessionCardCount = 0;
		this.sessionSource = "scheduled";
		this.isAnswerShown = false;
		this.isReviewComplete = false;
		this.skippedCardCount = 0;
		this.deferredCardCount = 0;
		this.suspendedCardCount = 0;
		this.deletedCardCount = 0;
		this.shouldRefreshQueueOnBack = false;
	}

	private getCurrentReviewableCard(): ReviewQueueCard | undefined {
		return this.selectedCards[this.selectedCardIndex];
	}

	private setReviewActionButtonsDisabled(disabled: boolean): void {
		for (const button of Array.from(this.contentEl.querySelectorAll<HTMLButtonElement>(".mneme-review-action-bar button"))) {
			button.disabled = disabled;
		}
	}

	private getExcludedCardIds(): Set<string> {
		return new Set([
			...Object.keys(this.activeRetirements),
			...Object.keys(this.activeSuspensions),
		]);
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

function formatSummary(loadSummary: ConceptLoadSummary, fsrsEnabled: boolean): string {
	const suffix = fsrsEnabled
		? "All FSRS-eligible Cards are available in priority order."
		: "Review scheduling is paused; Card state and history are unchanged.";

	return `Scanned ${loadSummary.scannedCards} cards across ${loadSummary.concepts} concepts. ${suffix}`;
}

function createEmptyFocusSelection(): TodaysFocusSelection {
	return {
		concepts: [],
		selectedCardCount: 0,
	};
}

function getQueuedReviewCards(concept: ReviewQueueConcept): ReviewQueueCard[] {
	return [
		...concept.dueCards,
		...concept.newCards,
	];
}

function getConceptReviewCards(concept: ReviewQueueConcept, excludedCardIds = new Set<string>()): ReviewQueueCard[] {
	return [
		...concept.dueCards,
		...concept.newCards,
		...concept.notDueCards,
	].filter((card) => !excludedCardIds.has(card.cardId));
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

function formatAssessmentCoverage(summary: ConceptMemorySummary): string {
	const types = summary.coveredCardTypes.length > 0
		? ` · ${summary.coveredCardTypes.join(", ")}`
		: "";
	if (summary.assessmentCoverage === "none") return "No valid probes";
	if (summary.assessmentCoverage === "limited") return `Limited (${summary.assessmentProbeCount} probe${types})`;
	return `Multiple (${summary.assessmentProbeCount} probes${types})`;
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

function isRenderedMathTarget(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest(".math, .math-inline, .math-block, .katex, mjx-container") !== null;
}

function markRenderedMathEditable(parentEl: HTMLElement): void {
	parentEl.querySelectorAll<HTMLElement>(".math, mjx-container").forEach((mathEl) => {
		mathEl.title = "Click to edit formula source";
	});
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

function formatRetentionPolicy(conceptTarget: number | undefined, globalTarget: number): string {
	return conceptTarget === undefined
		? `Retention Target: ${globalTarget.toFixed(2)} (global)`
		: `Retention Target: ${conceptTarget.toFixed(2)} (Concept override)`;
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

function formatInspectorCardStatus(card: ReviewQueueCard): string {
	if (card.eligibilityReason === "missing-card-id") {
		return "Needs stable Card ID";
	}

	switch (card.dueStatus) {
		case "due":
			return "Due";
		case "new":
			return "New";
		case "not-due":
			return "Later";
		case "invalid":
			return "Invalid";
	}
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
