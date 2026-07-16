import assert from "node:assert/strict";
import { assignCardId, createStableCardId } from "../src/services/cardIdEditor";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { repairCardMarkers, updateCardMarkers } from "../src/services/cardMarkerEditor";

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
	const changedTarget = multiCard.replace("Answer 2", "Answer changed outside Mneme");
	const result = updateCardMarkers(changedTarget, {
		back: "Edited answer",
		cardBlockIndex: 1,
		expectedBack: "Answer 2",
		expectedFront: "Question 2",
		expectedRubric: "Rubric 2",
		explicitCardId: "card-two",
		front: "Edited question",
		rubric: "Edited rubric",
	});

	assert.equal(result.status, "conflict");
	if (result.status !== "updated") {
		assert.match(result.message, /changed while the editor was open/);
	}
}

{
	const changedOtherCard = multiCard.replace("Question 1", "Question 1 changed outside Mneme");
	const result = updateCardMarkers(changedOtherCard, {
		back: "Edited answer 2",
		cardBlockIndex: 1,
		expectedBack: "Answer 2",
		expectedFront: "Question 2",
		expectedRubric: "Rubric 2",
		explicitCardId: "card-two",
		front: "Edited question 2",
		rubric: "Edited rubric 2",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const cards = parseMnemeCards(result.markdown);
		assert.equal(cards[0]?.front, "Question 1 changed outside Mneme");
		assert.equal(cards[1]?.front, "Edited question 2");
	}
}

{
	const duplicateId = multiCard.replace("id=card-one", "id=card-two");
	const result = updateCardMarkers(duplicateId, {
		back: "Edited answer",
		cardBlockIndex: 1,
		expectedBack: "Answer 2",
		expectedFront: "Question 2",
		expectedRubric: "Rubric 2",
		explicitCardId: "card-two",
		front: "Edited question",
		rubric: "Edited rubric",
	});

	assert.equal(result.status, "conflict");
	if (result.status !== "updated") {
		assert.match(result.message, /duplicated/);
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

{
	const missingBack = [
		"# Cards",
		"",
		"<!-- MNEME:CARD:start id=card-repair -->",
		"<!-- MNEME:FRONT:start -->",
		"Existing question",
		"<!-- MNEME:FRONT:end -->",
		"Keep this user note.",
		"<!-- MNEME:CARD:end -->",
	].join("\n");
	const result = repairCardMarkers(missingBack, {
		back: "Repaired answer",
		cardBlockIndex: 0,
		explicitCardId: "card-repair",
		front: "Existing question",
		rubric: "Repaired rubric",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const card = parseMnemeCards(result.markdown)[0];
		assert.equal(card?.isValid, true);
		assert.equal(card?.back, "Repaired answer");
		assert.equal(card?.rubric, "Repaired rubric");
		assert.equal(result.markdown.includes("Keep this user note."), true);
	}
}

{
	const missingBackChangedOutside = [
		"# Cards",
		"",
		"<!-- MNEME:CARD:start id=card-repair -->",
		"<!-- MNEME:FRONT:start -->",
		"Question changed outside Mneme",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n");
	const result = repairCardMarkers(missingBackChangedOutside, {
		back: "Repaired answer",
		cardBlockIndex: 0,
		expectedBack: "",
		expectedFront: "Existing question",
		expectedRubric: "",
		explicitCardId: "card-repair",
		front: "Existing question",
		rubric: "Repaired rubric",
	});

	assert.equal(result.status, "conflict");
}

{
	const legacyMissingFront = [
		"# Legacy Card",
		"",
		"<!-- MNEME:BACK:start -->",
		"Existing answer",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const result = repairCardMarkers(legacyMissingFront, {
		back: "Existing answer",
		cardBlockIndex: 0,
		front: "Repaired question",
		rubric: "Repaired rubric",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const card = parseMnemeCards(result.markdown)[0];
		assert.equal(card?.front, "Repaired question");
		assert.equal(card?.back, "Existing answer");
		assert.equal(result.markdown.startsWith("# Legacy Card"), true);
	}
}

{
	const malformed = [
		"<!-- MNEME:FRONT:start -->",
		"Unclosed question",
		"<!-- MNEME:BACK:start -->",
		"Answer",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const result = repairCardMarkers(malformed, {
		back: "Answer",
		cardBlockIndex: 0,
		front: "Question",
		rubric: "Rubric",
	});

	assert.equal(result.status, "invalid");
	if (result.status !== "updated") {
		assert.equal(result.message, "Card marker structure is invalid.");
	}
}

{
	const missingId = multiCard.replace(" id=card-one", "");
	const result = assignCardId(missingId, {
		cardBlockIndex: 0,
		newCardId: "card-repaired-one",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const cards = parseMnemeCards(result.markdown);
		assert.equal(cards[0]?.explicitCardId, "card-repaired-one");
		assert.equal(cards[1]?.explicitCardId, "card-two");
		assert.equal(result.markdown.startsWith("# Cards"), true);
	}
}

{
	const duplicateIds = multiCard.replace("id=card-two", "id=card-one");
	const result = assignCardId(duplicateIds, {
		cardBlockIndex: 1,
		expectedCardId: "card-one",
		newCardId: "card-repaired-two",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		const cards = parseMnemeCards(result.markdown);
		assert.equal(cards[0]?.explicitCardId, "card-one");
		assert.equal(cards[1]?.explicitCardId, "card-repaired-two");
	}
}

{
	const legacy = [
		"---",
		"mneme_type: card_group",
		"---",
		"# Legacy Card",
		"",
		"<!-- MNEME:FRONT:start -->",
		"Question",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"Answer",
		"<!-- MNEME:BACK:end -->",
	].join("\n");
	const result = assignCardId(legacy, {
		cardBlockIndex: 0,
		newCardId: "card-legacy-stable",
	});

	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.equal(result.markdown.startsWith("---\nmneme_type: card_group\n---\n# Legacy Card"), true);
		assert.equal(parseMnemeCards(result.markdown)[0]?.explicitCardId, "card-legacy-stable");
	}
}

{
	const result = assignCardId(multiCard, {
		cardBlockIndex: 0,
		expectedFront: "Changed question",
		expectedCardId: "card-one",
		newCardId: "card-concurrent-id",
	});

	assert.equal(result.status, "conflict");
}

{
	const result = assignCardId(multiCard, {
		cardBlockIndex: 0,
		expectedCardId: "changed-elsewhere",
		newCardId: "card-new-id",
	});

	assert.equal(result.status, "conflict");
}

{
	const result = assignCardId(multiCard, {
		cardBlockIndex: 0,
		expectedCardId: "card-one",
		newCardId: "bad id",
	});

	assert.equal(result.status, "invalid");
	assert.equal(createStableCardId(1_000, 0.5), "card_rs_0zik0zk");
}

console.log("Card marker editor tests passed.");
