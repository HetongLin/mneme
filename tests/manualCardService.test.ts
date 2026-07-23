import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { createManualCard } from "../src/services/manualCardService";

class MemoryVault {
	files = new Map<string, string>();
	folders = new Set<string>();

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error("exists");
		this.files.set(path, content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async modify(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) throw new Error("missing");
		this.files.set(path, content);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error("missing");
		return content;
	}
}

async function run(): Promise<void> {
	const concept: ConceptSummary = {
		cardsPath: "Mneme/Cards/间隔效应-(Spacing-Effect)/Cards.md",
		conceptId: "concept-spacing-effect",
		path: "Mneme/Concepts/间隔效应-(Spacing-Effect).md",
		title: "间隔效应 (Spacing Effect)",
	};
	const vault = new MemoryVault();
	const first = await createManualCard({
		back: "Learning spread across time is retained better than massed practice.",
		cardType: "definition",
		concept,
		front: "What is the spacing effect?",
	}, DEFAULT_SETTINGS, vault);

	assert.equal(first.cardId, "spacing-effect-definition");
	assert.equal(first.cardsPath, concept.cardsPath);
	const firstMarkdown = vault.files.get(first.cardsPath) ?? "";
	assert.match(firstMarkdown, /mneme_concept_id: concept-spacing-effect/);
	assert.match(firstMarkdown, /id="spacing-effect-definition" type="definition"/);
	assert.match(firstMarkdown, /concept: "\[\[Mneme\/Concepts\/间隔效应-\(Spacing-Effect\)\|间隔效应 \(Spacing Effect\)\]\]"/);

	const second = await createManualCard({
		back: "A second definition probe.",
		cardType: "definition",
		concept,
		front: "State the spacing effect in your own words.",
		rubric: "Mention distributed practice and retention.",
	}, DEFAULT_SETTINGS, vault);
	assert.equal(second.cardId, "spacing-effect-definition-2");
	const cards = parseMnemeCards(vault.files.get(second.cardsPath) ?? "");
	assert.equal(cards.length, 2);
	assert.deepEqual(cards.map((card) => card.explicitCardId), [
		"spacing-effect-definition",
		"spacing-effect-definition-2",
	]);
	assert.equal(cards[1]?.rubric, "Mention distributed practice and retention.");

	const historicalIdConcept: ConceptSummary = {
		conceptId: "concept-historical-example",
		path: "Mneme/Concepts/Historical-Example.md",
		title: "Historical Example",
	};
	const afterDeletedCard = await createManualCard({
		back: "A fresh answer with a distinct stable identity.",
		cardType: "definition",
		concept: historicalIdConcept,
		front: "What is the historical example?",
	}, DEFAULT_SETTINGS, vault, new Set(["historical-example-definition"]));
	assert.equal(afterDeletedCard.cardId, "historical-example-definition-2");

	await assert.rejects(createManualCard({
		back: "Answer",
		cardType: "trap",
		concept,
		front: "",
	}, DEFAULT_SETTINGS, vault), /Front is required/);

	const fallbackConcept: ConceptSummary = {
		conceptId: "concept-information-gain",
		path: "Mneme/Concepts/Information-Gain.md",
		title: "Information Gain",
	};
	const fallback = await createManualCard({
		back: "The reduction in entropy after observing a split.",
		cardType: "definition",
		concept: fallbackConcept,
		front: "What is information gain?",
	}, DEFAULT_SETTINGS, vault);
	assert.equal(fallback.cardsPath, "Mneme/Cards/Information-Gain/Cards.md");

	console.log("manual Card service tests passed");
}

void run();
