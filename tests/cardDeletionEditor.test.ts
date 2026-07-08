import assert from "node:assert/strict";
import { deleteCardBlock } from "../src/services/cardDeletionEditor";
import { parseMnemeCards } from "../src/services/cardMarkerParser";

const firstBlock = [
	'<!-- MNEME:CARD:start id="card-one" -->',
	"<!-- MNEME:FRONT:start -->",
	"Front one",
	"<!-- MNEME:FRONT:end -->",
	"<!-- MNEME:BACK:start -->",
	"Back one",
	"<!-- MNEME:BACK:end -->",
	"<!-- MNEME:CARD:end -->",
].join("\n");
const secondBlock = firstBlock.replace(/card-one/g, "card-two").replace(/one/g, "two");

{
	const markdown = `---\nmneme_type: card_group\n---\n# Cards\n\n${firstBlock}\n\nUser note\n\n${secondBlock}\n`;
	const result = deleteCardBlock(markdown, {
		cardId: "card-one",
		expectedBack: "Back one",
		expectedFront: "Front one",
	});

	assert.equal(result.status, "deleted");
	if (result.status === "deleted") {
		assert.equal(result.markdown, `---\nmneme_type: card_group\n---\n# Cards\n\n\n\nUser note\n\n${secondBlock}\n`);
	}
}

assert.equal(deleteCardBlock(firstBlock, {
	cardId: "card-one",
	expectedBack: "Changed",
	expectedFront: "Front one",
}).status, "conflict");

assert.equal(deleteCardBlock(`${firstBlock}\n${firstBlock}`, {
	cardId: "card-one",
	expectedBack: "Back one",
	expectedFront: "Front one",
}).status, "invalid");

const legacy = "<!-- MNEME:FRONT:start -->\nFront\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nBack\n<!-- MNEME:BACK:end -->";
assert.equal(deleteCardBlock(legacy, {
	cardId: "fallback",
	expectedBack: "Back",
	expectedFront: "Front",
}).status, "not_found");

{
	const markdown = `---\nmneme_type: card_group\n---\n# Cards\n\n${firstBlock}\n`;
	const result = deleteCardBlock(markdown, {
		cardId: "card-one",
		expectedBack: "Back one",
		expectedFront: "Front one",
	});
	assert.equal(result.status, "deleted");
	if (result.status === "deleted") {
		assert.deepEqual(parseMnemeCards(result.markdown), []);
	}
}
