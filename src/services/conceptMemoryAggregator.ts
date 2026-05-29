import {
	CardMemoryRisk,
	ConceptMemorySummary,
	ConceptPriorityBand,
} from "../models/conceptMemory";
import { ReviewQueueCard, ReviewQueueConcept } from "../models/reviewQueue";
import { CardReviewState } from "../models/reviewState";
import { estimateFsrsRisk } from "./fsrsRetrievability";

const DEFAULT_IMPORTANCE_WEIGHT = 0.5;
const LAPSE_RISK_BOOST = 0.1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function aggregateConceptMemoryById(
	concepts: ReviewQueueConcept[],
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): Record<string, ConceptMemorySummary> {
	const summaries = aggregateConceptMemory(concepts, reviewStates, now);
	const summariesById: Record<string, ConceptMemorySummary> = {};

	for (const summary of summaries) {
		summariesById[summary.conceptId] = summary;
	}

	return summariesById;
}

export function aggregateConceptMemory(
	concepts: ReviewQueueConcept[],
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): ConceptMemorySummary[] {
	return concepts.map((concept) => aggregateReviewQueueConcept(concept, reviewStates, now));
}

export function aggregateReviewQueueConcept(
	concept: ReviewQueueConcept,
	reviewStates: Record<string, CardReviewState>,
	now: Date,
): ConceptMemorySummary {
	const cards = [
		...concept.dueCards,
		...concept.newCards,
		...concept.notDueCards,
		...concept.invalidCards,
	];
	const cardRisks = cards.map((card) => calculateCardMemoryRisk(card, reviewStates[card.cardId], now));
	const validCardRisks = cardRisks.filter((cardRisk) => cardRisk.dueStatus !== "invalid");
	const reviewCardRisks = validCardRisks.filter((cardRisk) => cardRisk.includedInDailyReview);
	const validCardCount = validCardRisks.length;
	const reviewCardCount = reviewCardRisks.length;
	const newCardCount = concept.newCards.length;
	const dueCardCount = concept.dueCards.length;
	const notDueCardCount = concept.notDueCards.length;
	const invalidCardCount = concept.invalidCards.length;
	const overdueCardCount = reviewCardRisks.filter((cardRisk) => cardRisk.isOverdue).length;
	const topK = calculateTopK(validCardCount);
	const sortedRisks = validCardRisks.map((cardRisk) => cardRisk.risk).sort((a, b) => b - a);
	const topKRisks = sortedRisks.slice(0, topK);
	const averageRisk = average(sortedRisks);
	const topKAvgRisk = average(topKRisks);
	const weakestRisk = sortedRisks[0] ?? 0;
	const dueRatio = calculateRatio(dueCardCount, reviewCardCount);
	const newRatio = calculateRatio(newCardCount, reviewCardCount);
	const lapseRatio = calculateRatio(
		reviewCardRisks.filter((cardRisk) => cardRisk.lapseCount > 0 || cardRisk.lastRating === "again").length,
		reviewCardCount,
	);
	const includedReviewCardIds = reviewCardRisks.map((cardRisk) => cardRisk.cardId);
	const earliestDueAt = getEarliestDueAt(reviewCardRisks);
	const nextDueAt = getEarliestDueAt(validCardRisks.filter((cardRisk) => !cardRisk.includedInDailyReview));
	const reviewPriorityScore = calculateReviewPriorityScore({
		dueRatio,
		lapseRatio,
		newRatio,
		overdueRatio: calculateRatio(overdueCardCount, reviewCardCount),
		reviewCardCount,
	});
	const priorityScore = reviewPriorityScore;

	return {
		averageRisk,
		cardRisks,
		conceptId: concept.conceptId,
		dueCardCount,
		dueRatio,
		earliestDueAt,
		includedReviewCardIds,
		invalidCardCount,
		lapseRatio,
		newCardCount,
		newRatio,
		nextDueAt,
		notDueCardCount,
		overdueCardCount,
		priorityBand: getPriorityBand(priorityScore),
		priorityScore,
		reviewCardCount,
		reviewPriorityScore,
		title: concept.title,
		topK,
		topKAvgRisk,
		totalCardCount: cardRisks.length,
		validCardCount,
		weakestRisk,
	};
}

export function calculateCardMemoryRisk(
	card: ReviewQueueCard,
	reviewState: CardReviewState | undefined,
	now: Date,
): CardMemoryRisk {
	const lapseCount = reviewState?.lapseCount ?? 0;
	const lastRating = reviewState?.lastRating;
	const fsrsRisk = card.dueStatus === "invalid" ? undefined : estimateFsrsRisk(reviewState, now);
	const baseRisk = fsrsRisk?.risk ?? calculateBaseRisk(card, now);
	const risk = card.dueStatus === "invalid"
		? 0
		: clampRisk(baseRisk + (fsrsRisk ? 0 : getPlaceholderLapseBoost(lastRating)));

	return {
		cardId: card.cardId,
		dueAt: card.dueAt,
		dueStatus: card.dueStatus,
		eligibilityReason: card.eligibilityReason,
		includedInDailyReview: card.includedInDailyReview,
		isDue: card.isDue,
		isNew: card.isNew,
		isOverdue: card.isOverdue,
		lapseCount,
		lastRating,
		reviewCount: reviewState?.reviewCount ?? card.reviewCount,
		retrievability: fsrsRisk?.retrievability,
		risk,
		riskSource: fsrsRisk ? "fsrs" : "placeholder",
	};
}

export function calculateTopK(validCardCount: number): number {
	if (validCardCount === 0) {
		return 0;
	}

	return Math.min(5, Math.max(1, Math.ceil(validCardCount * 0.25)));
}

export function getPriorityBand(priorityScore: number): ConceptPriorityBand {
	if (priorityScore >= 0.70) {
		return "high";
	}

	if (priorityScore >= 0.40) {
		return "medium";
	}

	return "low";
}

function calculateBaseRisk(card: ReviewQueueCard, now: Date): number {
	switch (card.dueStatus) {
		case "invalid":
			return 0;
		case "new":
			return 0.85;
		case "due":
			return 0.75;
		case "not-due":
			return calculateNotDueRisk(card.dueAt, now);
	}
}

function getPlaceholderLapseBoost(lastRating: CardReviewState["lastRating"]): number {
	return lastRating === "again" ? LAPSE_RISK_BOOST : 0;
}

function calculateNotDueRisk(dueAt: string | undefined, now: Date): number {
	if (!dueAt) {
		return 0.35;
	}

	const dueAtMs = Date.parse(dueAt);

	if (Number.isNaN(dueAtMs)) {
		return 0.35;
	}

	const daysUntilDue = (dueAtMs - now.getTime()) / MS_PER_DAY;

	if (daysUntilDue <= 1) {
		return 0.45;
	}

	if (daysUntilDue <= 3) {
		return 0.30;
	}

	return 0.15;
}

function calculateRatio(count: number, total: number): number {
	if (total === 0) {
		return 0;
	}

	return count / total;
}

function calculateReviewPriorityScore(input: {
	dueRatio: number;
	lapseRatio: number;
	newRatio: number;
	overdueRatio: number;
	reviewCardCount: number;
}): number {
	if (input.reviewCardCount === 0) {
		return 0;
	}

	return clampRisk(
		0.45 * input.overdueRatio
		+ 0.35 * input.dueRatio
		+ 0.25 * input.newRatio
		+ 0.10 * input.lapseRatio
		+ 0.10 * DEFAULT_IMPORTANCE_WEIGHT,
	);
}

function getEarliestDueAt(cardRisks: CardMemoryRisk[]): string | undefined {
	const dueAts = cardRisks
		.map((cardRisk) => cardRisk.dueAt)
		.filter((dueAt): dueAt is string => dueAt !== undefined)
		.filter((dueAt) => !Number.isNaN(Date.parse(dueAt)))
		.sort((left, right) => Date.parse(left) - Date.parse(right));

	return dueAts[0];
}

function average(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampRisk(value: number): number {
	return Math.max(0, Math.min(1, value));
}
