import assert from "node:assert/strict";
import type { LoadedMnemeCard } from "../src/models/card";
import type { RankedReviewQueueConcept } from "../src/models/conceptQueue";
import type { ReviewQueueCard } from "../src/models/reviewQueue";
import { selectNextFocusConcept, selectTodaysFocus } from "../src/services/todaysFocusSelector";

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 12, 4, 1),
		createRanked("beta", 9, 3, 2),
		createRanked("gamma", 8, 2, 3),
	], true);

	assert.deepEqual(selection.concepts.map((item) => item.concept.conceptId), ["alpha", "beta", "gamma"]);
	assert.equal(selection.concepts[0]?.concept.dueCards.length, 12);
	assert.equal(selection.concepts[0]?.concept.newCards.length, 4);
	assert.equal(selection.selectedCardCount, 38);
}

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 2, 1, 1),
	], false);

	assert.deepEqual(selection.concepts, []);
	assert.equal(selection.selectedCardCount, 0);
}

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 4, 2, 1),
		createRanked("beta", 2, 1, 2),
	], true, {
		deferredCardIds: new Set(["alpha-due-0"]),
		pausedConceptIds: new Set(["beta"]),
		retiredCardIds: new Set(["alpha-due-1"]),
		suspendedCardIds: new Set(["alpha-new-0"]),
	});

	assert.deepEqual(selection.concepts.map((item) => item.concept.conceptId), ["alpha"]);
	assert.deepEqual(selection.concepts[0]?.concept.dueCards.map((card) => card.cardId), [
		"alpha-due-2",
		"alpha-due-3",
	]);
	assert.deepEqual(selection.concepts[0]?.concept.newCards.map((card) => card.cardId), ["alpha-new-1"]);
	assert.equal(selection.selectedCardCount, 3);
}

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 1, 0, 1),
		createRanked("beta", 1, 0, 2),
		createRanked("gamma", 1, 0, 3),
	], true);

	assert.equal(selectNextFocusConcept(selection, "alpha")?.concept.conceptId, "beta");
	assert.equal(selectNextFocusConcept(selection, "beta")?.concept.conceptId, "alpha");
	assert.equal(selectNextFocusConcept(selection, "missing")?.concept.conceptId, "alpha");
}

{
	const selection = selectTodaysFocus([
		createRanked("alpha", 1, 0, 1),
	], true);

	assert.equal(selectNextFocusConcept(selection, "alpha"), undefined);
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
