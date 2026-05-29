import assert from "node:assert/strict";
import { ConceptMemorySummary } from "../src/models/conceptMemory";
import { LoadedMnemeCard } from "../src/models/card";
import { ReviewQueueConcept } from "../src/models/reviewQueue";
import { rankReviewQueueConcepts } from "../src/services/conceptQueueRanker";

{
	const ranked = rankReviewQueueConcepts([
		createConcept("low", "Low", { dueCards: 1 }),
		createConcept("high", "High", { dueCards: 1 }),
	], {
		high: createMemorySummary("high", 0.8),
		low: createMemorySummary("low", 0.4),
	});

	assert.deepEqual(ranked.map((concept) => concept.concept.conceptId), ["high", "low"]);
}

{
	const ranked = rankReviewQueueConcepts([
		createConcept("one-due", "One Due", { dueCards: 1 }),
		createConcept("two-due", "Two Due", { dueCards: 2 }),
	], {
		"one-due": createMemorySummary("one-due", 0.5),
		"two-due": createMemorySummary("two-due", 0.5),
	});

	assert.deepEqual(ranked.map((concept) => concept.concept.conceptId), ["two-due", "one-due"]);
}

{
	const ranked = rankReviewQueueConcepts([
		createConcept("one-new", "One New", { newCards: 1 }),
		createConcept("two-new", "Two New", { newCards: 2 }),
	], {
		"one-new": createMemorySummary("one-new", 0.5),
		"two-new": createMemorySummary("two-new", 0.5),
	});

	assert.deepEqual(ranked.map((concept) => concept.concept.conceptId), ["two-new", "one-new"]);
}

{
	const ranked = rankReviewQueueConcepts([
		createConcept("zeta", "Zeta", { dueCards: 1 }),
		createConcept("alpha", "Alpha", { dueCards: 1 }),
	], {
		alpha: createMemorySummary("alpha", 0.5),
		zeta: createMemorySummary("zeta", 0.5),
	});

	assert.deepEqual(ranked.map((concept) => concept.concept.title), ["Alpha", "Zeta"]);
}

{
	const ranked = rankReviewQueueConcepts([
		createConcept("later-only", "Later Only", { notDueCards: 3 }),
		createConcept("due", "Due", { dueCards: 1 }),
	], {
		due: createMemorySummary("due", 0.5),
		"later-only": createMemorySummary("later-only", 0.9, 0),
	});

	assert.deepEqual(ranked.map((concept) => concept.concept.conceptId), ["due"]);
}

{
	const concepts = [
		createConcept("beta", "Beta", { dueCards: 1 }),
		createConcept("alpha", "Alpha", { dueCards: 1 }),
		createConcept("gamma", "Gamma", { dueCards: 1 }),
	];
	const summaries = {
		alpha: createMemorySummary("alpha", 0.5),
		beta: createMemorySummary("beta", 0.5),
		gamma: createMemorySummary("gamma", 0.5),
	};
	const firstRanking = rankReviewQueueConcepts(concepts, summaries);
	const secondRanking = rankReviewQueueConcepts([...concepts].reverse(), summaries);

	assert.deepEqual(
		firstRanking.map((concept) => concept.concept.conceptId),
		secondRanking.map((concept) => concept.concept.conceptId),
	);
	assert.deepEqual(firstRanking.map((concept) => concept.rank), [1, 2, 3]);
}

{
	const ranked = rankReviewQueueConcepts([
		createConcept("medium", "Medium", { dueCards: 1 }),
		createConcept("low", "Low", { dueCards: 1 }),
		createConcept("high", "High", { dueCards: 1 }),
	], {
		high: createMemorySummary("high", 0.8),
		low: createMemorySummary("low", 0.2),
		medium: createMemorySummary("medium", 0.5),
	});

	assert.deepEqual(ranked.map((concept) => concept.priorityBand), ["high", "medium", "low"]);
}

function createConcept(
	conceptId: string,
	title: string,
	counts: { dueCards?: number; newCards?: number; notDueCards?: number },
): ReviewQueueConcept {
	const dueCards = createQueueCards(conceptId, title, "due", counts.dueCards ?? 0);
	const newCards = createQueueCards(conceptId, title, "new", counts.newCards ?? 0);
	const notDueCards = createQueueCards(conceptId, title, "not-due", counts.notDueCards ?? 0);

	return {
		concept: {
			cards: [],
			errors: [],
			folderPath: conceptId,
			id: conceptId,
			isReviewable: dueCards.length + newCards.length > 0,
			title,
			warnings: [],
		},
		conceptId,
		dueCards,
		invalidCards: [],
		newCards,
		notDueCards,
		reviewableCount: dueCards.length + newCards.length,
		title,
		totalValidCount: dueCards.length + newCards.length + notDueCards.length,
	};
}

function createQueueCards(
	conceptId: string,
	conceptTitle: string,
	dueStatus: "due" | "new" | "not-due",
	count: number,
): ReviewQueueConcept["dueCards"] {
	return Array.from({ length: count }, (_, index) => {
		const cardId = `${conceptId}-${dueStatus}-${index}`;

		return {
			card: createCard(cardId),
			cardId,
			conceptId,
			conceptTitle,
			dueStatus,
			eligibilityReason: dueStatus,
			includedInDailyReview: dueStatus === "due" || dueStatus === "new",
			isDue: dueStatus === "due",
			isNew: dueStatus === "new",
			isOverdue: false,
			reviewCount: dueStatus === "new" ? 0 : 1,
		};
	});
}

function createCard(cardId: string): LoadedMnemeCard {
	return {
		back: "Back",
		basename: "Card",
		cardId,
		cardIndex: 0,
		content: "",
		errors: [],
		front: "Front",
		hasExplicitCardId: true,
		id: cardId,
		isValid: true,
		path: "Concept/Card.md",
		warnings: [],
	};
}

function createMemorySummary(conceptId: string, priorityScore: number, reviewCardCount = 1): ConceptMemorySummary {
	return {
		averageRisk: priorityScore,
		cardRisks: [],
		conceptId,
		dueCardCount: 0,
		dueRatio: 0,
		earliestDueAt: undefined,
		includedReviewCardIds: [],
		invalidCardCount: 0,
		lapseRatio: 0,
		newCardCount: 0,
		newRatio: 0,
		nextDueAt: undefined,
		notDueCardCount: 0,
		overdueCardCount: 0,
		priorityBand: priorityScore >= 0.7 ? "high" : priorityScore >= 0.4 ? "medium" : "low",
		priorityScore,
		reviewCardCount,
		reviewPriorityScore: priorityScore,
		title: conceptId,
		topK: 1,
		topKAvgRisk: priorityScore,
		totalCardCount: 1,
		validCardCount: 1,
		weakestRisk: priorityScore,
	};
}
