import { createEmptyManualConceptDraft } from "../src/models/manualConceptDraft";
import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import type { ConceptIdentityIssue } from "../src/models/conceptLibrary";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { RecoverableConceptIdRepair } from "../src/services/recoverableConceptIdRepair";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { RecoverableCardIdRepair } from "../src/services/recoverableCardIdRepair";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";

const cp = "Concepts/A.md", gp = "Cards/A.md", at = "2026-09-09T00:00:00.000Z";
const concept = (id?: string, link: string | undefined = gp) => `---\nmneme_type: concept${id ? `\nmneme_id: ${id}` : ""}${link ? `\ncards: ${link}` : ""}\n---\nLearner Concept prose\n`;
const group = (owner = "orphan-id") => `---\nmneme_type: card_group\nmneme_concept_id: ${owner}\n---\n<!-- MNEME:FRONT:start -->\nQuestion\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer\n<!-- MNEME:BACK:end -->\n`;
const issue: ConceptIdentityIssue = { kind: "missing_id", path: cp, cardsPath: gp, title: "A" };
class Storage {
	saves = 0;
	constructor(public data = createDefaultPluginData(), private fail?: { at: number; after?: boolean }) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saves++;
		if (this.fail?.at === this.saves && !this.fail.after) throw new Error("save-before");
		this.data = structuredClone(data);
		if (this.fail?.at === this.saves && this.fail.after) throw new Error("save-after");
	}
}
class Vault {
	files = new Map([[cp, concept()], [gp, group()]]);
	writes: string[] = [];
	reads = 0;
	fail?: { path: string; after?: boolean };
	beforeProcess?: (path: string) => Promise<void> | void;
	parseFrontmatter(markdown: string): unknown {
		const yaml = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? "";
		return Object.fromEntries(yaml.split(/\r?\n/).flatMap((line) => {
			const pair = /^([^:]+):[ \t]*(.*)$/.exec(line);
			return pair ? [[pair[1], pair[2]]] : [];
		}));
	}
	async readFresh(path: string): Promise<string> {
		this.reads++; const value = this.files.get(path);
		if (value === undefined) throw new Error(`Missing ${path}`);
		return value;
	}
	async listMarkdownFiles(): Promise<Array<{ path: string }>> { return [...this.files.keys()].map((path) => ({ path })); }
	async process(path: string, transform: (current: string) => string): Promise<void> {
		await this.beforeProcess?.(path);
		if (this.fail?.path === path && !this.fail.after) throw new Error("process-before");
		this.files.set(path, transform(await this.readFresh(path))); this.writes.push(path);
		if (this.fail?.path === path && this.fail.after) throw new Error("process-after");
	}
}
function seed(): MnemePluginData {
	const data = createDefaultPluginData();
	data.pausedConcepts["orphan-id"] = { conceptId: "orphan-id", pausedAt: at };
	data.reviewStates["card-a"] = { cardId: "card-a", createdAt: at, updatedAt: at, reviewCount: 3, lapseCount: 1 };
	data.manualConceptDraftId = "keep-draft";
	data.manualConceptDraft = { ...createEmptyManualConceptDraft(undefined, at, "keep-draft"), title: "Unrelated draft", coreMeaning: "Keep authored prose" };
	data.sourceAnalysisRecords["Source.md"] = { sourcePath: "Source.md", contentHash: "a".repeat(64), lastAnalyzedAt: at,
		linkedConceptIds: ["orphan-id"], pendingProposalIds: [], mtime: 1, size: 1, status: "clean" };
	data.extraFixture = { prose: "unrelated state stays", conceptId: "orphan-id" };
	return data;
}
function restarted(storage: Storage, vault: Vault): [Storage, Vault] {
	const s = new Storage(structuredClone(storage.data)); const v = new Vault(); v.files = new Map(vault.files); return [s, v];
}
function completed(storage: Storage, vault: Vault): void {
	assert.match(vault.files.get(cp)!, /mneme_id: new-id/);
	assert.match(vault.files.get(gp)!, /mneme_concept_id: new-id/);
	assert.deepEqual(storage.data.pausedConcepts, { "new-id": { conceptId: "new-id", pausedAt: at } });
	assert.deepEqual(storage.data.reviewStates, seed().reviewStates);
	assert.deepEqual(storage.data.extraFixture, seed().extraFixture);
	assert.equal(storage.data.manualConceptDraftId, "keep-draft");
	assert.deepEqual(storage.data.manualConceptDraft, seed().manualConceptDraft);
	assert.deepEqual(storage.data.sourceAnalysisRecords, seed().sourceAnalysisRecords);
	assert.equal(storage.data.conceptIdRepairs?.["new-id"]?.status, "completed");
}
async function run(): Promise<void> {
	for (const fail of [{ at: 1 }, { at: 1, after: true }, { at: 2 }, { at: 2, after: true }]) {
		const storage = new Storage(seed(), fail); const vault = new Vault();
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /save-/);
		const [s, v] = restarted(storage, vault);
		assert.equal(await new RecoverableConceptIdRepair(v, s).resume(), fail.at === 1 && !!fail.after || fail.at === 2 && !fail.after);
		if (fail.at === 1 && !fail.after) { assert.deepEqual(s.data, seed()); assert.deepEqual([...v.files], [...new Vault().files]); }
		else {
			completed(s, v);
			assert.deepEqual([...vault.writes, ...v.writes], [cp, gp], "each file changes exactly once across restart");
		}
		assert.equal(await new RecoverableConceptIdRepair(v, s).resume(), false);
	}
	for (const path of [cp, gp]) for (const after of [false, true]) {
		const storage = new Storage(seed()); const vault = new Vault(); vault.fail = { path, after };
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /process-/);
		assert.ok(storage.data.pausedConcepts["orphan-id"], "state does not migrate before both files complete");
		const [s, v] = restarted(storage, vault);
		assert.equal(await new RecoverableConceptIdRepair(v, s).resume(), true);
		completed(s, v); assert.deepEqual([...vault.writes, ...v.writes], [cp, gp]);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault();
		vault.files.set(cp, concept("orphan-id")); vault.files.set("Concepts/B.md", concept("orphan-id", "Cards/B.md"));
		await new RecoverableConceptIdRepair(vault, storage).repair({ ...issue, kind: "duplicate_id", conceptId: "orphan-id" }, "new-id");
		assert.deepEqual(storage.data.pausedConcepts, seed().pausedConcepts);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault();
		await new RecoverableConceptIdRepair(vault, storage).repair(issue, "orphan-id");
		assert.deepEqual(vault.writes, [cp]); assert.deepEqual(storage.data.pausedConcepts, seed().pausedConcepts);
	}
	{
		const storage = new Storage(); const vault = new Vault(); vault.files = new Map([[cp, concept(undefined, "")]]);
		await new RecoverableConceptIdRepair(vault, storage).repair({ ...issue, cardsPath: undefined }, "new-id");
		assert.deepEqual(vault.writes, [cp]); assert.equal(storage.data.conceptIdRepairs?.["new-id"]?.cards, undefined);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault();
		storage.data.manualConceptWrite = { version: 1, status: "written", draftId: "original-draft", inputHash: "a".repeat(64),
			conceptId: "orphan-id", path: cp, cardsPath: gp, afterHash: "b".repeat(64), englishAliasesEnabled: false, createdAt: at };
		await new RecoverableConceptIdRepair(vault, storage).repair(issue, "orphan-id");
		assert.deepEqual(vault.writes, [cp]); assert.deepEqual(storage.data.pausedConcepts, seed().pausedConcepts);
	}
	for (const owner of ["orphan-id", "new-id"]) {
		const storage = new Storage(seed()); const vault = new Vault(); vault.files.set("Cards/Other.md", group(owner));
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /Another Card Group/);
		assert.equal(storage.saves, 0); assert.deepEqual(vault.writes, []);
	}
	for (const mode of ["collision", "shared", "foreign"] as const) {
		const storage = new Storage(seed()); const vault = new Vault();
		vault.files.set("Concepts/B.md", concept(mode === "collision" ? "new-id" : mode === "foreign" ? "orphan-id" : "other-id", mode === "shared" ? gp : "Cards/B.md"));
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /already exists|shared|belongs/);
		assert.equal(storage.saves, 0); assert.deepEqual(vault.writes, []);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault();
		vault.beforeProcess = (path) => { if (path === cp) vault.files.set(gp, group() + "External edit"); };
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /conflict/);
		assert.deepEqual(vault.writes, [cp]); assert.match(vault.files.get(gp)!, /External edit/);
		const [s, v] = restarted(storage, vault); await assert.rejects(new RecoverableConceptIdRepair(v, s).resume(), /conflict/);
		assert.deepEqual(v.writes, []); assert.ok(s.data.pausedConcepts["orphan-id"]);
	}
	{
		const storage = new Storage(seed(), { at: 1, after: true }); const vault = new Vault();
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /save-/);
		vault.files.set("Concepts/B.md", concept("other-id", gp));
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).resume(), /shared/); assert.deepEqual(vault.writes, []);
		storage.data.conceptIdRepairs!["new-id"]!.concept.path = "../bad.md"; vault.reads = 0;
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).resume(), /invalid/); assert.equal(vault.reads, 0);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault(); const service = new RecoverableConceptIdRepair(vault, storage);
		await Promise.all([service.repair(issue, "new-id"), service.repair(issue, "new-id")]); assert.deepEqual(vault.writes, [cp, gp]);
		vault.files.set(cp, concept()); await assert.rejects(service.repair(issue, "new-id"), /conflict/); assert.deepEqual(vault.writes, [cp, gp]);
	}
	{
		const storage = new Storage(seed()); const vault = new Vault();
		let release!: () => void, enter!: () => void;
		const entered = new Promise<void>((resolve) => { enter = resolve; }); const barrier = new Promise<void>((resolve) => { release = resolve; });
		vault.beforeProcess = async () => { enter(); await barrier; };
		const service = new RecoverableConceptIdRepair(vault, storage); const store = new ReviewStateStore(storage, new FsrsReviewScheduler());
		const repair = service.repair(issue, "new-id"); await entered;
		const oldPause = assert.rejects(store.pauseConcept("orphan-id"), /identity|repair/);
		const settings = runPluginDataMutation(storage, async () => { const data = await storage.loadData() as MnemePluginData; await storage.saveData({ ...data, settings: { ...data.settings, fsrsEnabled: false } }); });
		release(); await Promise.all([repair, oldPause, settings]); completed(storage, vault); assert.equal(storage.data.settings.fsrsEnabled, false);
		await store.resumeConcept("new-id"); assert.equal(storage.data.pausedConcepts["new-id"], undefined);
	}
	{
		const storage = new Storage(seed(), { at: 1, after: true }); const vault = new Vault();
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /save-/);
		const store = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await assert.rejects(store.clearConceptPauses(), /Resume Concept ID Repair/);
		assert.deepEqual(storage.data.pausedConcepts, seed().pausedConcepts);
		for (const id of ["orphan-id", "new-id"]) {
			await assert.rejects(store.pauseConcept(id), /repair|identity/);
			await assert.rejects(store.resumeConcept(id), /repair|identity/);
			await assert.rejects(store.deleteConcept(id, []), /repair|identity/);
		}
		await assert.rejects(new RecoverableCardIdRepair(vault, storage).repair({ path: gp, content: group(), cardId: `${gp}#0`, cardIndex: 0, hasExplicitCardId: false, front: "Question", back: "Answer" }, "card-new"), /Concept ID Repair/);
		assert.deepEqual(vault.writes, []); assert.equal(storage.data.cardIdRepairs, undefined);
	}
	{
		const storage = new Storage(seed(), { at: 1, after: true }); const vault = new Vault();
		await assert.rejects(new RecoverableCardIdRepair(vault, storage).repair({ path: gp, content: group(), cardId: `${gp}#0`, cardIndex: 0, hasExplicitCardId: false, front: "Question", back: "Answer" }, "card-new"), /save-/);
		await assert.rejects(new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id"), /Card ID Repair/);
		assert.equal(storage.data.conceptIdRepairs, undefined); assert.deepEqual(vault.writes, []);
	}
	console.log("Recoverable Concept ID repair tests passed.");
}
export const done = run();
