import assert from "node:assert/strict";
import type { LoadedMnemeCard } from "../src/models/card";
import { exportCardsToAnkiTsv } from "../src/services/ankiTsvExporter";

const result = exportCardsToAnkiTsv([
	createCard("card-one", {
		front: "What is <encapsulation>?",
		back: "Hide representation\nbehind operations.",
		rubric: "Mentions boundary\tand representation.",
	}),
	createCard("card-retired"),
	createCard("card-invalid", { isValid: false }),
	createCard("Cards/Legacy/Card.md#0", { hasExplicitCardId: false }),
], {
	retiredCardIds: new Set(["card-retired"]),
});

assert.equal(result.exportedCardCount, 1);
assert.equal(result.skippedCardCount, 3);
assert.equal(
	result.tsv,
	[
		"What is &lt;encapsulation&gt;?",
		"Hide representation<br>behind operations.<br><hr><strong>Rubric</strong><br>Mentions boundary and representation.<br><!-- mneme_card_id: card-one -->",
		"mneme mneme_card_card_one",
	].join("\t"),
);

{
	const empty = exportCardsToAnkiTsv([
		createCard("missing-front", { front: "" }),
		createCard("missing-back", { back: "" }),
	]);

	assert.equal(empty.exportedCardCount, 0);
	assert.equal(empty.skippedCardCount, 2);
	assert.equal(empty.tsv, "");
}

console.log("Anki TSV exporter tests passed.");

function createCard(cardId: string, overrides: Partial<LoadedMnemeCard> = {}): LoadedMnemeCard {
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
		path: "Mneme/Cards/Concept/Card.md",
		warnings: [],
		...overrides,
	};
}
