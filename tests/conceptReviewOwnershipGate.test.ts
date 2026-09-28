import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { MnemeConceptLibraryView } from "../src/views/conceptLibraryView";

class Element {
	children: Element[] = [];
	disabled = false;
	constructor(readonly tag = "div", readonly text = "") {}
	createDiv(): Element { return this.createEl("div"); }
	createEl(tag: string, options?: { text?: string }, callback?: (el: Element) => void): Element {
		const el = new Element(tag, options?.text); this.children.push(el); callback?.(el); return el;
	}
	addClass(): void {}
	addEventListener(): void {}
	all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
}

interface Harness {
	renderConceptCard(parent: Element, concept: ConceptSummary): void;
	reviewConceptCards(concept: ConceptSummary): Promise<void>;
}

async function run(): Promise<void> {
	let generated = 0, reviewed = 0;
	const view = Object.create(MnemeConceptLibraryView.prototype) as Harness;
	Object.assign(view, {
		generatingCardConceptIds: new Set(),
		renderMarkdown: async () => {},
		generateConceptCardsForReview: async () => { generated++; },
		actions: { reviewCards: async () => { reviewed++; return "started"; } },
	});
	const blocked: ConceptSummary = {
		conceptId: "owner", path: "Notes/Owner.md", cardsPath: "Cards/Owner.md", title: "Owner",
		cardCount: 0, cardReviewError: "Conflicting Concept paths for owner owner: Notes/Owner.md, Notes/Other.md.",
	};
	const root = new Element();
	view.renderConceptCard(root, blocked);
	assert.equal(root.all().find((el) => el.text === "Review unavailable")?.disabled, true);
	assert.ok(root.all().some((el) => el.tag === "p" && el.text === blocked.cardReviewError));
	assert.equal(root.all().some((el) => el.text === "Generate to Review"), false);
	// Even a stale/directly invoked callback must not interpret the blocked
	// group's zero valid count as permission to generate new AI Cards.
	await view.reviewConceptCards(blocked);
	assert.equal(generated, 0); assert.equal(reviewed, 0);
	await view.reviewConceptCards({ ...blocked, cardReviewError: undefined, cardCount: 1 });
	assert.equal(reviewed, 1);
	await view.reviewConceptCards({ ...blocked, cardReviewError: undefined });
	assert.equal(generated, 1, "An ordinary empty Concept keeps Generate to Review");
	console.log("Concept review ownership gate tests passed.");
}

export const done = run();
