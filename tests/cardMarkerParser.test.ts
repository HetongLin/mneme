import assert from "node:assert/strict";
import { LoadedMnemeCard } from "../src/models/card";
import { markDuplicateCardIds } from "../src/services/cardFileLoader";
import { parseCardMarkers, parseMnemeCards } from "../src/services/cardMarkerParser";

const validCard = [
	"# Information Gain",
	"",
	"<!-- MNEME:FRONT:start -->",
	"Why does information gain tend to favor attributes with many values?",
	"<!-- MNEME:FRONT:end -->",
	"",
	"<!-- MNEME:BACK:start -->",
	"Because many-valued attributes can create smaller, purer subsets.",
	"<!-- MNEME:BACK:end -->",
	"",
	"<!-- MNEME:RUBRIC:start -->",
	"- Mentions many-valued attributes",
	"- Mentions smaller or purer subsets",
	"<!-- MNEME:RUBRIC:end -->",
].join("\n");

{
	const parsed = parseCardMarkers(validCard);

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
	assert.equal(parsed.back, "Because many-valued attributes can create smaller, purer subsets.");
	assert.equal(parsed.rubric, "- Mentions many-valued attributes\n- Mentions smaller or purer subsets");
	assert.deepEqual(parsed.errors, []);
	assert.deepEqual(parsed.warnings, []);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:FRONT:start -->\nWhy does information gain tend to favor attributes with many values?\n<!-- MNEME:FRONT:end -->", ""));

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "missing_required_section" && issue.section === "FRONT"), true);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:BACK:start -->\nBecause many-valued attributes can create smaller, purer subsets.\n<!-- MNEME:BACK:end -->", ""));

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "missing_required_section" && issue.section === "BACK"), true);
}

{
	const parsed = parseCardMarkers(validCard
		.replace("<!-- MNEME:RUBRIC:start -->\n- Mentions many-valued attributes\n- Mentions smaller or purer subsets\n<!-- MNEME:RUBRIC:end -->", ""));

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.rubric, "");
	assert.equal(parsed.warnings.some((issue) => issue.code === "missing_recommended_section" && issue.section === "RUBRIC"), true);
}

{
	const parsed = parseCardMarkers(`${validCard}\n\nSome extra Markdown outside markers.`);

	assert.equal(parsed.isValid, true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
}

{
	const malformed = [
		"<!-- MNEME:FRONT:start -->",
		"Unclosed front",
		"<!-- MNEME:BACK:start -->",
		"Back",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const parsed = parseCardMarkers(malformed);

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "unclosed_section" && issue.section === "FRONT"), true);
}

{
	const duplicateFront = `${validCard}\n<!-- MNEME:FRONT:start -->\nDuplicate\n<!-- MNEME:FRONT:end -->`;
	const parsed = parseCardMarkers(duplicateFront);

	assert.equal(parsed.isValid, false);
	assert.equal(parsed.errors.some((issue) => issue.code === "duplicate_section" && issue.section === "FRONT"), true);
	assert.equal(parsed.front, "Why does information gain tend to favor attributes with many values?");
}

{
	const parsedCards = parseMnemeCards(validCard);

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0]?.isValid, true);
	assert.equal(parsedCards[0]?.front, "Why does information gain tend to favor attributes with many values?");
	assert.equal(parsedCards[0]?.hasExplicitCardId, false);
	assert.equal(parsedCards[0]?.warnings.some((issue) => issue.code === "missing_explicit_card_id"), true);
}

const multiCard = [
	"Introductory Markdown is ignored.",
	"",
	"<!-- MNEME:CARD:start -->",
	"<!-- MNEME:FRONT:start -->",
	"Question 1",
	"<!-- MNEME:FRONT:end -->",
	"",
	"<!-- MNEME:BACK:start -->",
	"Answer 1",
	"<!-- MNEME:BACK:end -->",
	"",
	"<!-- MNEME:RUBRIC:start -->",
	"Rubric 1",
	"<!-- MNEME:RUBRIC:end -->",
	"<!-- MNEME:CARD:end -->",
	"",
	"Between-card Markdown is ignored.",
	"",
	"<!-- MNEME:CARD:start -->",
	"<!-- MNEME:FRONT:start -->",
	"Question 2",
	"<!-- MNEME:FRONT:end -->",
	"",
	"<!-- MNEME:BACK:start -->",
	"Answer 2",
	"<!-- MNEME:BACK:end -->",
	"",
	"<!-- MNEME:RUBRIC:start -->",
	"Rubric 2",
	"<!-- MNEME:RUBRIC:end -->",
	"<!-- MNEME:CARD:end -->",
].join("\n");

{
	const parsedCards = parseMnemeCards(multiCard);

	assert.equal(parsedCards.length, 2);
	assert.equal(parsedCards[0]?.isValid, true);
	assert.equal(parsedCards[0]?.front, "Question 1");
	assert.equal(parsedCards[1]?.isValid, true);
	assert.equal(parsedCards[1]?.front, "Question 2");
}

{
	const parsedCards = parseMnemeCards(multiCard
		.replace("<!-- MNEME:BACK:start -->\nAnswer 2\n<!-- MNEME:BACK:end -->", ""));

	assert.equal(parsedCards.length, 2);
	assert.equal(parsedCards[0]?.isValid, true);
	assert.equal(parsedCards[1]?.isValid, false);
	assert.equal(parsedCards[1]?.errors.some((issue) => issue.code === "missing_required_section" && issue.section === "BACK"), true);
}

{
	const parsedCards = parseMnemeCards(multiCard
		.replace("<!-- MNEME:RUBRIC:start -->\nRubric 1\n<!-- MNEME:RUBRIC:end -->", ""));

	assert.equal(parsedCards.length, 2);
	assert.equal(parsedCards[0]?.isValid, true);
	assert.equal(parsedCards[0]?.warnings.some((issue) => issue.code === "missing_recommended_section" && issue.section === "RUBRIC"), true);
	assert.equal(parsedCards[1]?.isValid, true);
}

{
	const parsedCards = parseMnemeCards(`${multiCard}\n\nTrailing Markdown is ignored.`);

	assert.equal(parsedCards.length, 2);
	assert.equal(parsedCards.every((card) => card.isValid), true);
}

{
	const parsedCards = parseMnemeCards([
		"<!-- MNEME:CARD:start -->",
		"<!-- MNEME:FRONT:start -->",
		"Question",
		"<!-- MNEME:FRONT:end -->",
	].join("\n"));

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0]?.isValid, false);
	assert.equal(parsedCards[0]?.errors.some((issue) => issue.code === "malformed_card_block"), true);
}

{
	const parsedCards = parseMnemeCards([
		"<!-- MNEME:CARD:start id=\"encapsulation-basic\" -->",
		"<!-- MNEME:FRONT:start -->",
		"What is encapsulation?",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Bundling data and operations.",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n"));

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0]?.explicitCardId, "encapsulation-basic");
	assert.equal(parsedCards[0]?.hasExplicitCardId, true);
	assert.equal(parsedCards[0]?.warnings.some((issue) => issue.code === "missing_explicit_card_id"), false);
}

{
	const parsedCards = parseMnemeCards([
		"<!-- MNEME:CARD:start id=encapsulation-basic -->",
		"<!-- MNEME:FRONT:start -->",
		"What is encapsulation?",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Bundling data and operations.",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n"));

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0]?.explicitCardId, "encapsulation-basic");
	assert.equal(parsedCards[0]?.hasExplicitCardId, true);
}

{
	const parsedCards = parseMnemeCards([
		"<!-- MNEME:CARD:start -->",
		"<!-- MNEME:FRONT:start -->",
		"What is encapsulation?",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Bundling data and operations.",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n"));

	assert.equal(parsedCards.length, 1);
	assert.equal(parsedCards[0]?.isValid, true);
	assert.equal(parsedCards[0]?.hasExplicitCardId, false);
	assert.equal(parsedCards[0]?.warnings.some((issue) => issue.code === "missing_explicit_card_id"), true);
}

{
	const parsedCards = parseMnemeCards([
		"<!-- MNEME:CARD:start id=\"encapsulation-basic\" -->",
		"<!-- MNEME:FRONT:start -->",
		"Question 1",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Answer 1",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
		"<!-- MNEME:CARD:start id=\"encapsulation-maintainability\" -->",
		"<!-- MNEME:FRONT:start -->",
		"Question 2",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Answer 2",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n"));

	assert.equal(parsedCards.length, 2);
	assert.equal(parsedCards[0]?.explicitCardId, "encapsulation-basic");
	assert.equal(parsedCards[1]?.explicitCardId, "encapsulation-maintainability");
	assert.equal(parsedCards.every((card) => card.isValid), true);
}

{
	const dedupedCards = markDuplicateCardIds([
		createLoadedCard("encapsulation-basic", "Card.md#0", 0),
		createLoadedCard("encapsulation-basic", "Card.md#1", 1),
		createLoadedCard("encapsulation-maintainability", "Card.md#2", 2),
	]);

	assert.equal(dedupedCards[0]?.isValid, false);
	assert.equal(dedupedCards[1]?.isValid, false);
	assert.equal(dedupedCards[2]?.isValid, true);
	assert.equal(dedupedCards[0]?.errors.includes("Duplicate card id: encapsulation-basic"), true);
	assert.equal(dedupedCards[1]?.errors.includes("Duplicate card id: encapsulation-basic"), true);
}

function createLoadedCard(cardId: string, id: string, cardIndex: number): LoadedMnemeCard {
	return {
		back: "Back",
		basename: "Card",
		cardId,
		cardIndex,
		content: "",
		errors: [],
		front: "Front",
		hasExplicitCardId: true,
		id,
		isValid: true,
		path: "Card.md",
		warnings: [],
	};
}
