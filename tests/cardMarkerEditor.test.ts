import assert from "node:assert/strict";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { updateCardMarkers } from "../src/services/cardMarkerEditor";

const multiCard = [
	"# Cards",
	"",
	"<!-- MNEME:CARD:start id=card-one -->",
	"<!-- MNEME:FRONT:start -->",
	"Question 1",
	"<!-- MNEME:FRONT:end -->",
	"<!-- MNEME:BACK:start -->",
	"Answer 1",
	"<!-- MNEME:BACK:end -->",
	"<!-- MNEME:CARD:end -->",
	"",
	"<!-- MNEME:CARD:start id=card-two -->",
	"<!-- MNEME:FRONT:start -->",
	"Question 2",
	"<!-- MNEME:FRONT:end -->",
	"<!-- MNEME:BACK:start -->",
	"Answer 2",
	"<!-- MNEME:BACK:end -->",
	"<!-- MNEME:RUBRIC:start -->",
	"Rubric 2",
	"<!-- MNEME:RUBRIC:end -->",
	"<!-- MNEME:CARD:end -->",
].join("\n");

{
	const result = updateCardMarkers(multiCard, {
		back: "Updated answer",
		cardBlockIndex: 1,
		explicitCardId: "card-two",
		front: "Updated question",
		rubric: "Updated rubric",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const cards = parseMnemeCards(result.markdown);
		assert.equal(cards[0]?.front, "Question 1");
		assert.equal(cards[0]?.back, "Answer 1");
		assert.equal(cards[1]?.front, "Updated question");
		assert.equal(cards[1]?.back, "Updated answer");
		assert.equal(cards[1]?.rubric, "Updated rubric");
	}
}

{
	const result = updateCardMarkers(multiCard, {
		back: "Answer 1",
		cardBlockIndex: 0,
		explicitCardId: "card-one",
		front: "Question 1",
		rubric: "New rubric",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.equal(parseMnemeCards(result.markdown)[0]?.rubric, "New rubric");
	}
}

{
	const singleCard = [
		"<!-- MNEME:FRONT:start -->",
		"Old question",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Old answer",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const result = updateCardMarkers(singleCard, {
		back: "New answer",
		cardBlockIndex: 0,
		front: "New question",
		rubric: "New rubric",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const parsed = parseMnemeCards(result.markdown)[0];
		assert.equal(parsed?.front, "New question");
		assert.equal(parsed?.back, "New answer");
		assert.equal(parsed?.rubric, "New rubric");
	}
}

{
	const result = updateCardMarkers(multiCard, {
		back: "Answer",
		cardBlockIndex: 0,
		explicitCardId: "card-one",
		front: "   ",
		rubric: "Rubric",
	});

	assert.equal(result.status, "invalid");
	assert.equal(result.message, "Front and Back are required.");
}

{
	const result = updateCardMarkers(multiCard, {
		back: "Answer",
		cardBlockIndex: 0,
		explicitCardId: "missing-card",
		front: "Question",
		rubric: "Rubric",
	});

	assert.equal(result.status, "not_found");
}

console.log("Card marker editor tests passed.");
