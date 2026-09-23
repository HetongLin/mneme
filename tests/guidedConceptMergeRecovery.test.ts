import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { ConceptMergeService, type ConceptMergeStorage, type ConceptMergeVaultAdapter } from "../src/services/conceptMergeService";
import { createConceptDuplicatePairKey } from "../src/services/conceptDuplicateDetector";
import { guidedMergeHash } from "../src/services/guidedConceptMergeRecovery";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { MemoryGuidedMergeJournal } from "./helpers/memoryGuidedMergeJournal";

const survivor = concept("concept-a", "Alpha", "Notes/Alpha.md", "Cards/Alpha.md");
const merged = concept("concept-b", "Beta", "Notes/Beta.md", "Cards/Beta.md");
const neighbor = concept("concept-neighbor", "Neighbor", "Notes/Neighbor.md");
const stamp = "2026-09-24T10:00:00.000Z";
const now = () => stamp;
const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type Fixture = ReturnType<typeof createFixture>;
const serviceFor = (f: Fixture) => new ConceptMergeService(f.vault, f.storage, now, f.journal);

async function prepare(f: Fixture) {
	const prepared = await serviceFor(f).prepare({ merged, preserveMergedAsView: true, survivor });
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	assert.equal(prepared.plan.writes.length, 5, "two Concepts, two Card Groups and one Related neighbor");
	return prepared.plan;
}
function restart(f: Fixture): Fixture {
	return { vault: new MemoryGuidedMergeVault(jsonClone(f.vault.files)), storage: new MemoryGuidedMergeStorage(jsonClone(f.storage.data)), journal: f.journal.clone() };
}
async function interrupt() {
	const f = createFixture(); const plan = await prepare(f);
	f.vault.failAfterProcess = 1;
	assert.equal((await serviceFor(f).execute(plan, plan.writes.find(w => w.path === survivor.path)!.after)).status, "failed");
	assert.equal(f.storage.data.guidedConceptMerge?.status, "pending");
	assert.doesNotMatch(JSON.stringify(f.storage.data.guidedConceptMerge), /Alpha question|Beta answer|Alpha meaning/);
	return { f: restart(f), plan };
}
async function assertComplete(f: Fixture, writes: Array<{path: string; after: string}>) {
	for (const w of writes) assert.equal(f.vault.files[w.path], w.after);
	assert.equal(f.storage.data.guidedConceptMerge?.status, "written");
	assert.equal(f.storage.data.conceptMergeRecords[merged.conceptId]?.survivorConceptId, survivor.conceptId);
	assert.equal(Object.values(f.storage.data.conceptSourceLinks)[0]?.conceptId, survivor.conceptId);
	assert.deepEqual(f.storage.data.sourceAnalysisRecords["Sources/One.md"]?.linkedConceptIds, [survivor.conceptId]);
	assert.equal(f.storage.data.pausedConcepts[merged.conceptId], undefined);
	assert.equal(f.storage.data.pausedConcepts[survivor.conceptId]?.pausedAt, stamp);
	assert.equal(Object.values(f.storage.data.conceptDuplicateDismissals)[0]?.conceptIds.includes(merged.conceptId), false);
	assert.equal(f.storage.data.reviewStates["card-b"]?.reviewCount, 2);
	assert.ok(!f.journal.has(f.storage.data.guidedConceptMerge!.operationId));
	const data = jsonClone(f.storage.data); const files = { ...f.vault.files }; const writesBefore = f.vault.processCount; const saves = f.storage.saveCount;
	assert.equal((await serviceFor(f).resume()).status, "merged");
	assert.deepEqual(f.storage.data, data); assert.deepEqual(f.vault.files, files);
	assert.equal(f.vault.processCount, writesBefore); assert.equal(f.storage.saveCount, saves);
}
async function run(): Promise<void> {
	{
		const f = createFixture(); const files = { ...f.vault.files }; await prepare(f);
		assert.deepEqual(f.vault.files, files); assert.equal(f.storage.saveCount, 0); assert.deepEqual(f.journal.writes, []);
		assert.notEqual(await guidedMergeHash("a\r\n"), await guidedMergeHash("a\n"));
	}
	{
		const f = createFixture();
		const first = { ...survivor, conceptId: "legacy:alpha.v1" };
		const second = { ...merged, conceptId: "legacy:beta.v2" };
		f.vault.files[first.path] = conceptMarkdown(first); f.vault.files[second.path] = conceptMarkdown(second);
		f.vault.files[first.cardsPath!] = cardMarkdown(first, "legacy:card.a"); f.vault.files[second.cardsPath!] = cardMarkdown(second, "legacy:card.b");
		const result = await serviceFor(f).prepare({ survivor: first, merged: second, preserveMergedAsView: true });
		if (result.status !== "ready") throw new Error(result.message);
		assert.equal((await serviceFor(f).execute(result.plan, result.plan.writes.find(w => w.path === first.path)!.after)).status, "merged");
		assert.deepEqual(f.storage.data.guidedConceptMerge?.cardIds, ["legacy:card.a", "legacy:card.b"]);
	}
	// Reconstruct all services and persisted state at each side of every file-write boundary.
	for (const timing of ["before", "after"] as const) for (let index = 1; index <= 5; index++) {
		const f = createFixture(); const plan = await prepare(f);
		if (timing === "before") f.vault.failBeforeProcess = index; else f.vault.failAfterProcess = index;
		assert.equal((await serviceFor(f).execute(plan, plan.writes.find(w => w.path === survivor.path)!.after)).status, "failed", `${timing} ${index}`);
		const reloaded = restart(f); const partialFiles = { ...reloaded.vault.files };
		assert.equal((await serviceFor(reloaded).resume()).status, "merged", `${timing} ${index}`);
		for (const w of plan.writes) if (partialFiles[w.path] === w.after) assert.ok(!reloaded.vault.writtenPaths.includes(w.path), "already applied files must be skipped");
		await assertComplete(reloaded, plan.writes);
	}
	// Journal, intent save and completion save may throw either before or after taking effect.
	for (const boundary of ["journal", "intent", "completion"] as const) for (const timing of ["before", "after"] as const) {
		const f = createFixture(); const plan = await prepare(f); const original = { ...f.vault.files };
		if (boundary === "journal") { if (timing === "before") f.journal.failWrite = true; else f.journal.failAfterWrite = true; }
		else { const index = boundary === "intent" ? 1 : 2; if (timing === "before") f.storage.failBeforeSave = index; else f.storage.failAfterSave = index; }
		assert.equal((await serviceFor(f).execute(plan, plan.writes.find(w => w.path === survivor.path)!.after)).status, "failed");
		if (boundary !== "completion") assert.deepEqual(f.vault.files, original);
		const reloaded = restart(f);
		const noIntent = boundary === "journal" || (boundary === "intent" && timing === "before");
		assert.equal((await serviceFor(reloaded).resume()).status, noIntent ? "none" : "merged", `${boundary}/${timing}`);
		if (!noIntent) await assertComplete(reloaded, plan.writes);
		else {
			// The same still-reviewed plan can retry; an orphan is never used without its receipt.
			assert.equal((await serviceFor(reloaded).execute(plan, plan.writes.find(w => w.path === survivor.path)!.after)).status, "merged");
			await assertComplete(reloaded, plan.writes);
		}
	}
	{
		const { f, plan } = await interrupt();
		f.storage.data.settings.fsrsEnabled = false;
		f.storage.data.reviewStates["card-b"]!.reviewCount = 9;
		f.storage.data.reviewStates["card-b"]!.stability = 12.5;
		f.storage.data.reviewEvents.latest = { cardId: "card-b", eventId: "latest", rating: "good", reviewedAt: stamp };
		const reviews = jsonClone(f.storage.data.reviewStates); const events = jsonClone(f.storage.data.reviewEvents);
		f.storage.data.sourceAnalysisRecords["Sources/One.md"]!.lastAiCaptureFingerprint = "new-analysis";
		assert.equal((await serviceFor(f).resume()).status, "merged");
		assert.deepEqual(f.storage.data.reviewStates, reviews); assert.deepEqual(f.storage.data.reviewEvents, events);
		assert.equal(f.storage.data.settings.fsrsEnabled, false); assert.equal(f.storage.data.reviewStates["card-b"]?.reviewCount, 9);
		assert.equal(f.storage.data.sourceAnalysisRecords["Sources/One.md"]?.lastAiCaptureFingerprint, "new-analysis");
		const final = plan.writes.find(w => w.path === survivor.path)!.after;
		assert.equal((await serviceFor(f).execute(plan, final)).status, "merged");
		assert.equal((await serviceFor(f).execute(plan, final + "\nchanged\n")).status, "failed");
	}
	for (const mutation of ["journal-missing", "journal-corrupt", "receipt-corrupt", "participant-id", "card-ids", "file-missing", "third-content", "source-links", "inventory", "identity", "related", "resolution"] as const) {
		const { f } = await interrupt(); const op = f.storage.data.guidedConceptMerge!.operationId;
		if (mutation === "journal-missing") await f.journal.remove(op);
		if (mutation === "journal-corrupt") f.journal.set(op, "corrupt");
		if (mutation === "receipt-corrupt") f.storage.data.guidedConceptMerge!.journalHash = "invalid";
		if (mutation === "participant-id") f.storage.data.guidedConceptMerge!.merged.conceptId = "wrong-id";
		if (mutation === "card-ids") f.storage.data.guidedConceptMerge!.cardIds = [];
		if (mutation === "file-missing") delete f.vault.files[merged.path];
		if (mutation === "third-content") f.vault.files[merged.path] += "\nLearner edit\n";
		if (mutation === "source-links") f.storage.data.conceptSourceLinks.source!.evidence = [{ excerpt: "changed" }];
		if (mutation === "inventory") f.vault.files["Other.md"] = "new file";
		if (mutation === "identity") f.vault.files["Notes/Other.md"] = conceptMarkdown(concept("changed-id", "Other", "Notes/Other.md"));
		if (mutation === "related") f.vault.files["Notes/Other.md"] += "\n## Related Concepts\n- [[Notes/Alpha]]\n";
		if (mutation === "resolution") f.vault.resolvedAsset = "assets/different.png";
		const files = { ...f.vault.files }; const data = jsonClone(f.storage.data); const snapshot = f.journal.get(op);
		const result = await serviceFor(f).resume();
		assert.ok(result.status === "conflict" || result.status === "failed", mutation);
		assert.deepEqual(f.vault.files, files); assert.deepEqual(f.storage.data, data); assert.equal(f.journal.get(op), snapshot);
		assert.equal(f.vault.processCount, 0); assert.equal(f.storage.saveCount, 0);
	}
	{
		const { f, plan } = await interrupt(); f.journal.failRemove = true;
		assert.equal((await serviceFor(f).resume()).status, "merged");
		assert.equal(f.storage.data.guidedConceptMerge?.status, "written");
		assert.ok(f.journal.has(plan.operationId));
		const reloaded = restart(f);
		// Terminal retry must neither replay Markdown nor overwrite later edits.
		reloaded.vault.files[survivor.path] += "\nPost-completion edit\n";
		assert.equal((await serviceFor(reloaded).resume()).status, "merged");
		assert.equal(reloaded.vault.processCount, 0); assert.equal(reloaded.storage.saveCount, 0);
		assert.match(reloaded.vault.files[survivor.path]!, /Post-completion edit/);
		assert.ok(!reloaded.journal.has(plan.operationId));
	}
}
function createFixture() {
	const vault = new MemoryGuidedMergeVault({
		[survivor.path]: conceptMarkdown(survivor) + "\n## Related Concepts\n- [[diagram.png]]\n",
		[merged.path]: conceptMarkdown(merged),
		[survivor.cardsPath!]: cardMarkdown(survivor, "card-a"),
		[merged.cardsPath!]: cardMarkdown(merged, "card-b"),
		[neighbor.path]: conceptMarkdown(neighbor) + "\n## Related Concepts\n- [[Notes/Beta]]\n",
		["Notes/Other.md"]: conceptMarkdown(concept("other", "Other", "Notes/Other.md")),
	});
	const data = createDefaultPluginData();
	data.pausedConcepts[merged.conceptId] = { conceptId: merged.conceptId, pausedAt: stamp };
	data.reviewStates["card-b"] = { cardId: "card-b", reviewCount: 2, lapseCount: 0, createdAt: stamp, updatedAt: stamp };
	data.sourceAnalysisRecords["Sources/One.md"] = { sourcePath: "Sources/One.md", contentHash: "hash", mtime: 1, size: 1, status: "clean", lastAnalyzedAt: stamp, linkedConceptIds: [merged.conceptId], pendingProposalIds: [] };
	data.conceptSourceLinks.source = { id: "source", conceptId: merged.conceptId, sourcePath: "Sources/One.md", sourceHash: "hash", addedAt: stamp, lastSeenAt: stamp, relationType: "origin", status: "approved", evidence: [{ excerpt: "source evidence" }] };
	const pairKey = createConceptDuplicatePairKey(merged.conceptId, neighbor.conceptId);
	data.conceptDuplicateDismissals[pairKey] = { pairKey, conceptIds: [merged.conceptId, neighbor.conceptId], dismissedAt: stamp };
	return { vault, storage: new MemoryGuidedMergeStorage(data), journal: new MemoryGuidedMergeJournal() };
}
class MemoryGuidedMergeVault implements ConceptMergeVaultAdapter {
	failBeforeProcess?: number; failAfterProcess?: number; processCount = 0;
	writtenPaths: string[] = []; resolvedAsset = "assets/diagram.png";
	constructor(public files: Record<string, string>) {}
	resolveLinkpath(target: string): string | undefined { return target === "diagram.png" ? this.resolvedAsset : undefined; }
	async exists(path: string) { return this.files[path] !== undefined; }
	async listMarkdownFiles() { return Object.keys(this.files).map(path => ({ path })); }
	async read(path: string) { const value = this.files[path]; if (value === undefined) throw new Error(`Missing file: ${path}`); return value; }
	async process(path: string, transform: (current: string) => string) {
		this.processCount++;
		if (this.failBeforeProcess === this.processCount) throw new Error("Injected before-process failure");
		this.files[path] = transform(await this.read(path)); this.writtenPaths.push(path);
		if (this.failAfterProcess === this.processCount) throw new Error("Injected after-process failure");
	}
}
class MemoryGuidedMergeStorage implements ConceptMergeStorage {
	saveCount = 0; failBeforeSave?: number; failAfterSave?: number;
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return jsonClone(this.data); }
	async saveData(data: MnemePluginData) {
		this.saveCount++;
		if (this.failBeforeSave === this.saveCount) throw new Error("Injected before-save failure");
		this.data = jsonClone(data);
		if (this.failAfterSave === this.saveCount) throw new Error("Injected after-save failure");
	}
}
function concept(id: string, title: string, path: string, cardsPath?: string): ConceptSummary {
	return { cardsPath, conceptId: id, coreMeaning: `${title} core`, path, title };
}

function conceptMarkdown(value: ConceptSummary): string {
	return [`---`, `mneme_type: concept`, `mneme_id: ${value.conceptId}`, value.cardsPath ? `cards: "[[${value.cardsPath}|${value.title} Cards]]"` : "", `---`, `# ${value.title}`, "", `${value.title} meaning`, ""].filter(Boolean).join("\n");
}

function cardMarkdown(value: ConceptSummary, cardId: string): string {
	return [`---`, `mneme_type: card_group`, `mneme_concept_id: ${value.conceptId}`, `concept: "[[${value.path}|${value.title}]]"`, `---`, `# ${value.title} Cards`, "", `<!-- MNEME:CARD:start id="${cardId}" -->`, "<!-- MNEME:FRONT:start -->", `${value.title} question`, "<!-- MNEME:FRONT:end -->", "<!-- MNEME:BACK:start -->", `${value.title} answer`, "<!-- MNEME:BACK:end -->", "<!-- MNEME:CARD:end -->", ""].join("\n");
}


export const done = run();
