import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { ConceptDeletionService, type ConceptDeletionVaultAdapter } from "../src/services/conceptDeletionService";

const concept: ConceptSummary = { cardCount: 1, cardsPath: "Mneme/Cards/First Cards.md", conceptId: "concept-first", path: "Mneme/Concepts/First.md", title: "First" };
const related: ConceptSummary = { conceptId: "concept-second", path: "Mneme/Concepts/Second.md", title: "Second" };
const conceptMarkdown = "---\nmneme_type: concept\nmneme_id: concept-first\n---\n# First\n";
const validCards = "---\nmneme_type: card_group\nmneme_concept_id: concept-first\n---\n";

class MemoryVault implements ConceptDeletionVaultAdapter {
	constructor(readonly files: Map<string, string>) {}
	async create(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async modify(path: string, content: string): Promise<void> { if (!this.files.has(path)) throw new Error(`Missing ${path}`); this.files.set(path, content); }
	async read(path: string): Promise<string> { const content = this.files.get(path); if (content === undefined) throw new Error(`Missing ${path}`); return content; }
	async remove(path: string): Promise<void> { if (!this.files.delete(path)) throw new Error(`Missing ${path}`); }
}

async function run(): Promise<void> {
	{
		const vault = new MemoryVault(new Map([[concept.path, conceptMarkdown], [concept.cardsPath!, validCards], [related.path, "# Second\n"]]));
		const result = await new ConceptDeletionService(vault).prepare(concept, [concept, related]);
		assert.equal(result.status, "ready");
		if (result.status === "ready") assert.deepEqual(result.plan.cardIds, []);
	}

	for (const cards of ["# Ordinary learner note\n", "---\nmneme_type: card_group\n---\n# Missing owner\n", "---\nmneme_type: concept\nmneme_concept_id: concept-first\n---\n", "---\nmneme_type: card_group\nmneme_concept_id: concept-other\n---\n"]) {
		const vault = new MemoryVault(new Map([[concept.path, conceptMarkdown], [concept.cardsPath!, cards]]));
		const result = await new ConceptDeletionService(vault).prepare(concept, [concept]);
		assert.equal(result.status, "blocked", "invalid Cards identity must block deletion");
		assert.equal(await vault.read(concept.cardsPath!), cards);
	}

	for (const markdown of ["---\nmneme_type: concept\nmneme_id: concept-other\n---\n", "---\nmneme_type: concept\n---\n"]) {
		const vault = new MemoryVault(new Map([[concept.path, markdown]]));
		const result = await new ConceptDeletionService(vault).prepare(concept, [concept]);
		assert.equal(result.status, "blocked", "Concept identity must block deletion");
	}

	console.log("Concept deletion prepare tests passed.");
}

export const done = run();
