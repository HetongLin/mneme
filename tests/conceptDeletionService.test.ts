import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	ConceptDeletionService,
	type ConceptDeletionVaultAdapter,
} from "../src/services/conceptDeletionService";

const first: ConceptSummary = {
	cardCount: 1,
	cardsPath: "Mneme/Cards/First Cards.md",
	conceptId: "concept-first",
	path: "Mneme/Concepts/First.md",
	title: "First",
};
const second: ConceptSummary = {
	conceptId: "concept-second",
	path: "Mneme/Concepts/Second.md",
	relatedConceptIds: ["concept-first"],
	title: "Second",
};
const files = new Map<string, string>([
	[first.path, "---\nmneme_type: concept\nmneme_id: concept-first\n---\n# First\n"],
	[first.cardsPath!, [
		"---",
		"mneme_type: card_group",
		"mneme_concept_id: concept-first",
		"---",
		'<!-- MNEME:CARD:start id="first-definition" type="definition" -->',
		"<!-- MNEME:FRONT:start -->",
		"What is First?",
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		"First.",
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
	].join("\n")],
	[second.path, "---\nmneme_type: concept\nmneme_id: concept-second\n---\n# Second\n\n## Related Concepts\n\n- [[Mneme/Concepts/First|First]]\n"],
]);
class MemoryVault implements ConceptDeletionVaultAdapter {
	constructor(private readonly files: Map<string, string>) {
	}

	async create(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async modify(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) throw new Error(`Missing ${path}`);
		this.files.set(path, content);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing ${path}`);
		return content;
	}

	async remove(path: string): Promise<void> {
		if (!this.files.delete(path)) throw new Error(`Missing ${path}`);
	}
}

async function run(): Promise<void> {
	const vault = new MemoryVault(files);
	const service = new ConceptDeletionService(vault);
	const prepared = await service.prepare(first, [first, second]);

	assert.equal(prepared.status, "ready");
	if (prepared.status === "ready") {
		assert.deepEqual(prepared.plan.cardIds, ["first-definition"]);
		assert.equal(prepared.plan.relatedWrites.length, 1);
		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "deleted");
	}
	assert.equal(await vault.exists(first.path), false);
	assert.equal(await vault.exists(first.cardsPath!), false);
	assert.doesNotMatch(await vault.read(second.path), /First/);
}

void run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
