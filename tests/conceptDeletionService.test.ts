import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { ConceptDeletionService, type ConceptDeletionVaultAdapter } from "../src/services/conceptDeletionService";

const concept: ConceptSummary = { cardCount: 1, cardsPath: "Mneme/Cards/First Cards.md", conceptId: "concept-first", path: "Mneme/Concepts/First.md", title: "First" };
const related: ConceptSummary = { conceptId: "concept-second", path: "Mneme/Concepts/Second.md", title: "Second" };
const conceptMarkdown = "---\nmneme_type: concept\nmneme_id: concept-first\n---\n# First\n";
const validCards = "---\nmneme_type: card_group\nmneme_concept_id: concept-first\n---\n";

class MemoryVault implements ConceptDeletionVaultAdapter {
	constructor(readonly files: Map<string, string>) {}
	resolveLinkpath?: (linkpath: string, sourcePath: string) => string | undefined;
	async create(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async modify(path: string, content: string): Promise<void> { if (!this.files.has(path)) throw new Error(`Missing ${path}`); this.files.set(path, content); }
	async read(path: string): Promise<string> { const content = this.files.get(path); if (content === undefined) throw new Error(`Missing ${path}`); return content; }
	async remove(path: string): Promise<void> { if (!this.files.delete(path)) throw new Error(`Missing ${path}`); }
}

function relatedMarkdown(links: string): string {
	return `# Second\n## Related Concepts\n${links}\n`;
}

async function run(): Promise<void> {
	{
		const root = { ...concept, cardsPath: undefined, path: "First.md" };
		const other = "# Second\n## Related Concepts\n- [[Archive/First|Archived First]]\n";
		const vault = new MemoryVault(new Map([[root.path, conceptMarkdown], [related.path, other]]));
		const result = await new ConceptDeletionService(vault).prepare(root, [root, related]);
		assert.equal(result.status, "ready");
		if (result.status !== "ready") throw new Error(result.message);
		assert.deepEqual(result.plan.relatedWrites, [], "Deleting a root Concept must not remove qualified links to another directory");
		assert.equal(await vault.read(related.path), other);
	}

	// A root-level target must not capture a bare First link from Archive/Reader
	// when Obsidian resolves it to Archive/First.md.
	{
		const root = { ...concept, cardsPath: undefined, path: "First.md" };
		const reader = { conceptId: "concept-reader", path: "Archive/Reader.md", title: "Reader" };
		const other = relatedMarkdown("- [[First|Archived First]]");
		const vault = new MemoryVault(new Map([[root.path, conceptMarkdown], [reader.path, other]]));
		vault.resolveLinkpath = (linkpath, sourcePath) => linkpath === "First" && sourcePath === reader.path
			? "Archive/First.md" : undefined;
		const result = await new ConceptDeletionService(vault).prepare(root, [root, reader]);
		assert.equal(result.status, "ready");
		if (result.status !== "ready") throw new Error(result.message);
		assert.deepEqual(result.plan.relatedWrites, []);
		assert.equal(result.plan.relatedChecks?.length, 1);
	}

	// Bare links are resolved from the related file's directory. A qualified link
	// to the target is removed while a same-name link to another file survives.
	{
		const root = { ...concept, cardsPath: undefined, path: "Mneme/Concepts/First.md" };
		const otherPath = "Archive/First.md";
		const other = relatedMarkdown("- [[First|Archived First]]\n- [[Mneme/Concepts/First|First]]");
		const vault = new MemoryVault(new Map([[root.path, conceptMarkdown], [related.path, other]]));
		vault.resolveLinkpath = (linkpath, sourcePath) => linkpath === "First" && sourcePath === related.path
			? otherPath : linkpath === "Mneme/Concepts/First" ? root.path : undefined;
		const result = await new ConceptDeletionService(vault).prepare(root, [root, related]);
		assert.equal(result.status, "ready");
		if (result.status !== "ready") throw new Error(result.message);
		assert.equal(result.plan.relatedWrites.length, 1);
		assert.match(result.plan.relatedWrites[0]!.after, /\[\[First\|Archived First\]\]/);
		assert.doesNotMatch(result.plan.relatedWrites[0]!.after, /Mneme\/Concepts\/First/);
	}

	// A bare link resolves to the target and is removed.
	{
		const root = { ...concept, cardsPath: undefined, path: "Mneme/Concepts/First.md" };
		const other = relatedMarkdown("- [[First|First]]");
		const vault = new MemoryVault(new Map([[root.path, conceptMarkdown], [related.path, other]]));
		vault.resolveLinkpath = (linkpath) => linkpath === "First" ? root.path : undefined;
		const result = await new ConceptDeletionService(vault).prepare(root, [root, related]);
		assert.equal(result.status, "ready");
		if (result.status !== "ready") throw new Error(result.message);
		assert.equal(result.plan.relatedWrites.length, 1);
		assert.doesNotMatch(result.plan.relatedWrites[0]!.after, /\[\[First/);
	}

	// Same-name bare links must be blocked when resolution is unavailable.
	for (const resolve of [undefined, () => undefined]) {
		const root = { ...concept, cardsPath: undefined, path: "Mneme/Concepts/First.md" };
		const other = relatedMarkdown("- [[First|First]]");
		const vault = new MemoryVault(new Map([[root.path, conceptMarkdown], [related.path, other]]));
		vault.resolveLinkpath = resolve;
		const result = await new ConceptDeletionService(vault).prepare(root, [root, related]);
		assert.equal(result.status, "blocked");
	}

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
