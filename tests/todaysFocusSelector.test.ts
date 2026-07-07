import assert from "node:assert/strict";
import type { LoadedMnemeCard } from "../src/models/card";
import type { RankedReviewQueueConcept } from "../src/models/conceptQueue";
import type { ReviewQueueCard } from "../src/models/reviewQueue";
import { selectTodaysFocus } from "../src/services/todaysFocusSelector";
import { buildTodaysFocusUsage } from "../src/services/todaysFocusSelector";

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 4, 2, 1),
		createRanked("beta", 3, 0, 2),
		createRanked("gamma", 2, 0, 3),
	], {
		cardsPerConcept: 2,
		dailyCards: 3,
		dailyConcepts: 2,
	});

	assert.deepEqual(selection.concepts.map((item) => item.concept.conceptId), ["alpha", "beta"]);
	assert.equal(selection.concepts[0]?.concept.dueCards.length, 2);
	assert.equal(selection.concepts[0]?.concept.newCards.length, 0);
	assert.equal(selection.concepts[1]?.concept.dueCards.length, 1);
	assert.equal(selection.selectedCardCount, 3);
	assert.equal(selection.hiddenCardCount, 8);
	assert.equal(selection.hiddenConceptCount, 1);
}

{
	const ranked = [
		createRanked("alpha", 3, 0, 1),
		createRanked("beta", 2, 0, 2),
	];
	const alpha = ranked[0]?.concept;
	const beta = ranked[1]?.concept;

	assert.ok(alpha && beta);
	const usage = buildTodaysFocusUsage([alpha, beta], {
		"alpha-due-0": {
			cardId: "alpha-due-0",
			createdAt: "2026-07-07T08:00:00.000Z",
			lapseCount: 0,
			lastReviewedAt: "2026-07-07T09:00:00.000Z",
			reviewCount: 1,
			updatedAt: "2026-07-07T09:00:00.000Z",
		},
	}, new Date("2026-07-07T12:00:00.000Z"));
	const selection = selectTodaysFocus(ranked, {
		cardsPerConcept: 2,
		dailyCards: 3,
		dailyConcepts: 2,
	}, usage);

	assert.equal(usage.reviewedCardIds.has("alpha-due-0"), true);
	assert.equal(selection.selectedCardCount, 2);
	assert.deepEqual(selection.concepts[0]?.concept.dueCards.map((card) => card.cardId), ["alpha-due-1"]);
	assert.deepEqual(selection.concepts[1]?.concept.dueCards.map((card) => card.cardId), ["beta-due-0"]);
}

{
	const usage = {
		reviewedCardIds: new Set(["old-a", "old-b"]),
		reviewedCardsByConcept: { alpha: 1, beta: 1 },
		reviewedConceptIds: new Set(["alpha", "beta"]),
	};
	const selection = selectTodaysFocus([createRanked("alpha", 2, 0, 1)], {
		cardsPerConcept: 3,
		dailyCards: 10,
		dailyConcepts: 1,
	}, usage);

	assert.equal(selection.selectedCardCount, 0);
}

{
	const selection = selectTodaysFocus([createRanked("alpha", 3, 0, 1)], {
		cardsPerConcept: 3,
		dailyCards: 3,
		dailyConcepts: 1,
	}, undefined, new Set(["alpha-due-0"]));

	assert.deepEqual(selection.concepts[0]?.concept.dueCards.map((card) => card.cardId), [
		"alpha-due-1",
		"alpha-due-2",
	]);
	assert.equal(selection.hiddenCardCount, 1);
}

{
	const selection = selectTodaysFocus([createRanked("new-only", 0, 3, 1)], {
		cardsPerConcept: 2,
		dailyCards: 10,
		dailyConcepts: 5,
	});

	assert.equal(selection.concepts[0]?.concept.newCards.length, 2);
	assert.equal(selection.selectedCardCount, 2);
	assert.equal(selection.hiddenCardCount, 1);
}

function createRanked(
	conceptId: string,
	dueCount: number,
	newCount: number,
	rank: number,
): RankedReviewQueueConcept {
	const dueCards = createCards(conceptId, "due", dueCount);
	const newCards = createCards(conceptId, "new", newCount);

	return {
		concept: {
			concept: {
				cards: [],
				errors: [],
				folderPath: conceptId,
				id: conceptId,
				isReviewable: true,
				title: conceptId,
				warnings: [],
			},
			conceptId,
			dueCards,
			invalidCards: [],
			newCards,
			notDueCards: [],
			reviewableCount: dueCount + newCount,
			title: conceptId,
			totalValidCount: dueCount + newCount,
		},
		priorityBand: "medium",
		priorityScore: 0.5,
		rank,
		reviewPriorityScore: 0.5,
	};
}

function createCards(conceptId: string, status: "due" | "new", count: number): ReviewQueueCard[] {
	return Array.from({ length: count }, (_, index) => {
		const cardId = `${conceptId}-${status}-${index}`;

		return {
			card: createCard(cardId),
			cardId,
			conceptId,
			conceptTitle: conceptId,
			dueStatus: status,
			eligibilityReason: status,
			includedInDailyReview: true,
			isDue: status === "due",
			isNew: status === "new",
			isOverdue: false,
			reviewCount: status === "due" ? 1 : 0,
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
		path: `${cardId}.md`,
		warnings: [],
	};
}
