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
	readonly files = new Map(files);
	beforeWrite?: (path: string) => void;
	beforeRemove?: (path: string) => void;
	removed: string[] = [];

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error(`Already exists: ${path}`);
		this.files.set(path, content);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}

	async modify(path: string, content: string): Promise<void> {
		this.beforeWrite?.(path);
		if (!this.files.has(path)) throw new Error(`Missing ${path}`);
		this.files.set(path, content);
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.beforeWrite?.(path);
		const current = this.files.get(path);
		if (current === undefined) throw new Error(`Missing ${path}`);
		this.files.set(path, transform(current));
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing ${path}`);
		return content;
	}

	async remove(path: string): Promise<void> {
		this.beforeRemove?.(path);
		if (!this.files.delete(path)) throw new Error(`Missing ${path}`);
		this.removed.push(path);
	}
}

async function run(): Promise<void> {
	const vault = new MemoryVault();
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
	for (const invalid of [
		"# Ordinary learner note\n",
		"---\nmneme_type: card_group\n---\n# Missing owner\n",
		"---\nmneme_type: concept\nmneme_concept_id: concept-first\n---\n",
		"---\nmneme_type: card_group\nmneme_concept_id: concept-other\n---\n",
	]) {
		const invalidVault = new MemoryVault();
		invalidVault.files.set(first.cardsPath!, invalid);
		const blocked = await new ConceptDeletionService(invalidVault).prepare(first, [first, second]);
		assert.equal(blocked.status, "blocked", "Cards must have a recognized type and matching owner before deletion");
		assert.deepEqual(invalidVault.removed, []);
		assert.equal(await invalidVault.read(first.cardsPath!), invalid);
	}
	{
		const raceVault = new MemoryVault();
		const service = new ConceptDeletionService(raceVault);
		const prepared = await service.prepare(first, [first, second]);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const edited = `${files.get(second.path)}\nUser edits immediately before the related write\n`;
		raceVault.beforeWrite = (path) => { raceVault.beforeWrite = undefined; raceVault.files.set(path, edited); };
		assert.equal((await service.execute(prepared.plan)).status, "conflict");
		assert.equal(await raceVault.read(second.path), edited);
		assert.deepEqual(raceVault.removed, []);
	}
	for (const editOnRollback of [false, true]) {
		const rollbackVault = new MemoryVault();
		const service = new ConceptDeletionService(rollbackVault);
		const prepared = await service.prepare(first, [first, second]);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const edited = `${prepared.plan.relatedWrites[0]!.after}\nUser edits before rollback\n`;
		let writes = 0;
		rollbackVault.beforeWrite = (path) => {
			writes += 1;
			if (editOnRollback && writes === 2) rollbackVault.files.set(path, edited);
		};
		rollbackVault.beforeRemove = (path) => { if (path === first.path) throw new Error("Injected Concept deletion failure"); };
		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.equal(await rollbackVault.read(first.path), files.get(first.path));
		assert.equal(await rollbackVault.read(first.cardsPath!), files.get(first.cardsPath!));
		assert.equal(await rollbackVault.read(second.path), editOnRollback ? edited : files.get(second.path));
		if (editOnRollback && result.status === "failed") assert.match(result.message, /rollback/i);
	}
	{
		const rollbackVault = new MemoryVault();
		const service = new ConceptDeletionService(rollbackVault);
		const prepared = await service.prepare(first, [first, second]);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const result = await service.execute(prepared.plan, () => { throw new Error("State save failed"); });
		assert.equal(result.status, "failed");
		assert.deepEqual([...rollbackVault.files].sort(), [...files].sort());
	}

	{
		const concurrentVault = new MemoryVault();
		const service = new ConceptDeletionService(concurrentVault);
		const prepared = await service.prepare(first, [first, second]);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		let callbacks = 0;
		const results = await Promise.all([
			service.execute(prepared.plan, () => { callbacks += 1; }),
			new ConceptDeletionService(concurrentVault).execute(prepared.plan, () => { callbacks += 1; }),
		]);
		assert.equal(results.filter((result) => result.status === "deleted").length, 1);
		assert.equal(callbacks, 1);
		assert.equal(await concurrentVault.exists(first.path), false);
		assert.equal(await concurrentVault.exists(first.cardsPath!), false);
		assert.doesNotMatch(await concurrentVault.read(second.path), /First/);
	}
	{
		const editedVault = new MemoryVault();
		const service = new ConceptDeletionService(editedVault);
		const prepared = await service.prepare(first, [first, second]);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const edited = `${files.get(first.cardsPath!)}\nA new Card or learner edit\n`;
		editedVault.beforeWrite = () => { editedVault.beforeWrite = undefined; editedVault.files.set(first.cardsPath!, edited); };
		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "conflict");
		assert.equal(await editedVault.read(first.cardsPath!), edited);
		assert.equal(await editedVault.read(second.path), files.get(second.path));
		assert.deepEqual(editedVault.removed, []);
	}
	{
		const occupiedVault = new MemoryVault();
		const service = new ConceptDeletionService(occupiedVault);
		const prepared = await service.prepare(first, [first, second]);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const result = await service.execute(prepared.plan, () => {
			occupiedVault.files.set(first.cardsPath!, "# New unrelated content at the removed path");
			throw new Error("State save failed");
		});
		assert.equal(result.status, "failed");
		if (result.status === "failed") assert.match(result.message, /path is occupied/);
		assert.equal(await occupiedVault.read(first.cardsPath!), "# New unrelated content at the removed path");
	}

}

export const done = run();
