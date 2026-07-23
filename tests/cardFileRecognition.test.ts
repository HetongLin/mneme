import assert from "node:assert/strict";
import { isCardFile } from "../src/services/cardFileRecognition";

assert.equal(isCardFile({ name: "Card.md" }), true);
assert.equal(isCardFile({ name: "Cards.md" }), true);
assert.equal(isCardFile({ name: "Notes.md" }, { mneme_type: "card_group" }), true);
assert.equal(isCardFile({ name: "Notes.md" }, { mneme_type: "card" }), true);
assert.equal(isCardFile({ name: "Notes.md" }, { mneme_type: "concept" }), false);
assert.equal(isCardFile({ name: "Notes.md" }), false);

console.log("Card file recognition tests passed.");
