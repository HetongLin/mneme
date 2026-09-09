import assert from "node:assert/strict";
import { assignCardId } from "../src/services/cardIdEditor";

const card = [
	"# Cards", "",
	'<!-- MNEME:CARD:start id="old-id" data-id="do-not-touch" type="definition" custom="x" -->',
	"<!-- MNEME:FRONT:start -->", "Front prose", "<!-- MNEME:FRONT:end -->",
	"<!-- MNEME:BACK:start -->", "Back prose", "<!-- MNEME:BACK:end -->",
	"<!-- MNEME:CARD:end -->",
].join("\n");

{
	const result = assignCardId(card, { cardBlockIndex: 0, expectedBack: "Back prose", expectedCardId: "old-id", expectedFront: "Front prose", newCardId: "new-id" });
	assert.equal(result.status, "updated");
	if (result.status === "updated") {
		assert.equal(result.markdown, card.replace('id="old-id"', 'id="new-id"'));
	}
}

for (const attributes of [
	'id="old-id" id="second" type="definition"',
	'data-id="old-id" type="definition"',
	'title="id=old-id" type="definition"',
]) {
	const markdown = card.replace('id="old-id" data-id="do-not-touch" type="definition" custom="x"', attributes);
	const result = assignCardId(markdown, { cardBlockIndex: 0, expectedCardId: "old-id", expectedFront: "Front prose", expectedBack: "Back prose", newCardId: "new-id" });
	assert.notEqual(result.status, "updated", `ambiguous attributes must be rejected: ${attributes}`);
}

for (const [oldId, replacement] of [["old-id", "id=new-id"], ["old-id", "id = 'new-id'"]]) {
	const markdown = card.replace('id="old-id" data-id="do-not-touch" type="definition" custom="x"', replacement === "id=new-id" ? "id=old-id type=definition" : "id = 'old-id' type=definition");
	const expected = markdown.replace("old-id", "new-id");
	const result = assignCardId(markdown, { cardBlockIndex: 0, expectedCardId: oldId, expectedFront: "Front prose", expectedBack: "Back prose", newCardId: "new-id" });
	assert.equal(result.status, "updated");
	if (result.status === "updated") assert.equal(result.markdown, expected);
}

{
	const legacy = "<!-- MNEME:FRONT:start -->\nFront\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nBack\n<!-- MNEME:BACK:end -->";
	const result = assignCardId(legacy, { cardBlockIndex: 0, expectedFront: "Front", expectedBack: "Back", newCardId: "legacy-id" });
	assert.equal(result.status, "updated");
	if (result.status === "updated") assert.match(result.markdown, /MNEME:CARD:start id="legacy-id"/);
}

{
	const nested = card.replace("<!-- MNEME:CARD:end -->", "<!-- MNEME:CARD:start id=\"nested\" -->\n<!-- MNEME:CARD:end -->\n<!-- MNEME:CARD:end -->");
	const result = assignCardId(nested, { cardBlockIndex: 0, expectedCardId: "old-id", expectedFront: "Front prose", expectedBack: "Back prose", newCardId: "new-id" });
	assert.equal(result.status, "invalid");
}


for (const attributes of [
	'title="prefix id=old-id" type="definition"',
	'data-id="old-id" id="real-id" type="definition"',
	'id="" type="definition"',
	'id="old-id" id= type="definition"',
]) {
	const markdown = card.replace('id="old-id" data-id="do-not-touch" type="definition" custom="x"', attributes);
	const result = assignCardId(markdown, { cardBlockIndex: 0, expectedCardId: "old-id", expectedFront: "Front prose", expectedBack: "Back prose", newCardId: "new-id" });
	assert.notEqual(result.status, "updated", "an ambiguous parsed identity cannot be repaired by guessing");
}
{
	const markdown = card.replace('id="old-id" data-id="do-not-touch" type="definition" custom="x" ', 'type="definition" custom="keep" \t');
	const result = assignCardId(markdown, { cardBlockIndex: 0, expectedFront: "Front prose", expectedBack: "Back prose", newCardId: "new-id" });
	assert.equal(result.status, "updated");
	if (result.status === "updated") assert.equal(result.markdown, markdown.replace('custom="keep" \t-->', 'custom="keep" \t id="new-id"-->'));
}
console.log("Card ID editor tests passed.");

{
	const incompleteNeighbor = '\n<!-- MNEME:CARD:start id="incomplete" -->\n<!-- MNEME:FRONT:start -->\nOnly front\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:CARD:end -->';
	const markdown = card + incompleteNeighbor;
	const result = assignCardId(markdown, { cardBlockIndex: 0, expectedCardId: "old-id", newCardId: "new-id" });
	assert.equal(result.status, "updated", "unrelated missing sections do not prevent a valid ID-only repair");
	if (result.status === "updated") assert.equal(result.markdown, markdown.replace('id="old-id"', 'id="new-id"'));
}
