import assert from "node:assert/strict";
import { ConceptDeletionService, type ConceptDeletionPlan, type ConceptDeletionWrite } from "../src/services/conceptDeletionService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { deletionContentHash, RecoverableConceptDeletion } from "../src/services/recoverableConceptDeletion";
import { removeRelatedConceptLink } from "../src/services/conceptRelatedLinks";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { ReviewStateStore } from "../src/services/reviewStateStore";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { readConceptDeletions } from "../src/services/conceptDeletionReceipt";
import type { MnemePluginData } from "../src/models/reviewState";

const conceptPath = "Mneme/Concepts/First.md";
const cardsPath = "Mneme/Cards/First Cards.md";
const relatedPath = "Mneme/Concepts/Second.md";
const conceptMarkdown = "---\nmneme_type: concept\nmneme_id: concept-first\n---\n# First\n";
const cardsMarkdown = "---\nmneme_type: card_group\nmneme_concept_id: concept-first\n---\n<!-- MNEME:CARD:start id=\"first-card\" type=\"definition\" -->\n<!-- MNEME:FRONT:start -->\nWhat is First?\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nFirst.\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n";
const relatedMarkdown = "---\nmneme_type: concept\nmneme_id: concept-second\n---\n# Second\n\n## Related Concepts\n\n- [[Mneme/Concepts/First|First]]\n";

function plan(): ConceptDeletionPlan {

	return {
		cardIds: ["first-card"],
		cardsFile: { path: cardsPath, content: cardsMarkdown },
		concept: { conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" },
		conceptFile: { path: conceptPath, content: conceptMarkdown },
		relatedWrites: [{
			path: relatedPath,
			before: relatedMarkdown,
			after: removeRelatedConceptLink(relatedMarkdown, conceptPath).markdown,
		}],
	};
}

class MemoryStorage {
	data: MnemePluginData = createDefaultPluginData();
	private saves = 0;
	constructor(private readonly failure?: { save?: number; afterSave?: boolean }) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saves += 1;
		if (this.failure?.save === this.saves && !this.failure.afterSave) throw new Error(`save-${this.saves}`);
		this.data = structuredClone(data);
		if (this.failure?.save === this.saves && this.failure.afterSave) throw new Error(`save-${this.saves}`);
	}
}

class MemoryVault {
	readonly files = new Map([[conceptPath, conceptMarkdown], [cardsPath, cardsMarkdown], [relatedPath, relatedMarkdown]]);
	readonly trashed = new Map<string, string>();
	trashCount = 0;
	private calls = 0;
	resolveLinkpath?: (linkpath: string, sourcePath: string) => string | undefined;
	renameEntered?: () => void;
	renameRelease?: Promise<void>;
	constructor(private readonly failure?: { kind: "rename" | "trash" | "process"; call: number; after?: boolean }) {}
	private fail(kind: "rename" | "trash" | "process"): void {
		this.calls += 1;
		if (this.failure?.kind === kind && this.failure.call === this.calls && !this.failure.after) throw new Error(`${kind}-before`);
	}
	private failAfter(kind: "rename" | "trash" | "process"): void {
		if (this.failure?.kind === kind && this.failure.call === this.calls && this.failure.after) throw new Error(`${kind}-after`);
	}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error(`Missing ${path}`);
		return value;
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.fail("process");
		this.files.set(path, transform(await this.read(path)));
		this.failAfter("process");
	}
	async rename(path: string, destination: string): Promise<void> {
		this.fail("rename");
		this.renameEntered?.();
		if (this.renameRelease) await this.renameRelease;
		if (this.files.has(destination)) throw new Error(`Occupied ${destination}`);
		const value = await this.read(path);
		this.files.delete(path); this.files.set(destination, value);
		this.failAfter("rename");
	}
	async trash(path: string): Promise<void> {
		this.fail("trash");
		const value = await this.read(path);
		this.files.delete(path); this.trashed.set(path, value); this.trashCount += 1;
		this.failAfter("trash");
	}
}

function planWithChecks(before: string, after: string): ConceptDeletionPlan {
	const relatedWrite: ConceptDeletionWrite = { path: relatedPath, before, after };
	return { ...plan(), relatedChecks: [relatedWrite], relatedWrites: [relatedWrite] };
}

async function rejects(action: Promise<unknown>, pattern: RegExp): Promise<void> {
	await assert.rejects(action, pattern);
}

async function assertCompleted(storage: MemoryStorage, vault: MemoryVault): Promise<void> {
	assert.equal(vault.files.has(conceptPath), false);
	assert.equal(vault.files.has(cardsPath), false);
	assert.doesNotMatch(await vault.read(relatedPath), /First/);
	assert.equal(Object.keys(storage.data.conceptDeletions ?? {}).length, 1);
	assert.equal(Object.values(storage.data.conceptDeletions ?? {})[0]?.status, "deleted");
	assert.equal(vault.trashCount, 2, "each file is trashed exactly once");
	assert.ok(storage.data.cardTombstones["first-card"]);
	assert.deepEqual(Object.values(storage.data.conceptDeletions ?? {})[0] && (Object.values(storage.data.conceptDeletions ?? {})[0] as Record<string, unknown>).cardIds, undefined);
}

async function run(): Promise<void> {
	{
		const storage = new MemoryStorage();
		const vault = new MemoryVault();
		await new RecoverableConceptDeletion(vault, storage, () => "op-one", () => "2026-09-08T00:00:00.000Z").delete(plan());
		await assertCompleted(storage, vault);
		assert.deepEqual([...vault.trashed.keys()].sort(), [`${cardsPath}.mneme-delete-op-one`, `${conceptPath}.mneme-delete-op-one`]);
	}
	{
		let release!: () => void;
		const entered = new Promise<void>((resolve) => { release = resolve; });
		const storage = new MemoryStorage(); const vault = new MemoryVault();
		vault.renameRelease = entered;
		let sawRename = false;
		vault.renameEntered = () => { sawRename = true; vault.renameEntered = undefined; };
		const deletion = new RecoverableConceptDeletion(vault, storage, () => "queue", () => "2026-09-08T00:00:00.000Z");
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.load();
		const deleting = deletion.delete(plan());
		while (!sawRename) await new Promise((resolve) => setTimeout(resolve, 0));
		const deletedReview = reviews.recordReview("first-card", "good");
		const unrelatedReview = reviews.recordReview("unrelated-card", "good");
		const settings = runPluginDataMutation(storage, async () => {
			const data = await storage.loadData() as MnemePluginData;
			await storage.saveData({ ...data, settings: { ...DEFAULT_SETTINGS, fsrsEnabled: false } });
		});
		release(); vault.renameRelease = undefined;
		await deleting;
		await assert.rejects(deletedReview, /Deleted Card IDs/);
		await unrelatedReview; await settings;
		assert.equal(Object.values(storage.data.reviewEvents).filter((event) => event.cardId === "first-card").length, 0);
		assert.equal(Object.values(storage.data.reviewEvents).filter((event) => event.cardId === "unrelated-card").length, 1);
		assert.equal(storage.data.settings.fsrsEnabled, false);
	}

	// A storage double must copy bytes; mutating a loaded object is not persistence.
	for (const afterSave of [false, true]) for (const save of [1, 2, 3, 4, 5, 6]) {
		const storage = new MemoryStorage({ save, afterSave });
		const vault = new MemoryVault();
		seedState(storage);
		const before = structuredClone(storage.data);
		await rejects(new RecoverableConceptDeletion(vault, storage, () => `save-${save}`).delete(plan()), /save-/);
		const persistedCompletion = afterSave && save === 6;
		assert.equal(!!storage.data.cardTombstones["first-card"], persistedCompletion);
		assert.equal(!!storage.data.conceptSourceLinks["link-first"], !persistedCompletion);
		if (save === 1 && !afterSave) {
			assert.equal(await new RecoverableConceptDeletion(vault, storage).resume(), false);
			assert.equal(vault.files.size, 3, "failed intent does not mutate Markdown");
			await new RecoverableConceptDeletion(vault, storage, () => "retry-intent").delete(plan());
		} else {
			assert.equal(await new RecoverableConceptDeletion(vault, storage).resume(), !persistedCompletion);
		}
		await assertCompleted(storage, vault);
		assert.equal(storage.data.cardTombstones["first-card"]?.reviewCount, 3);
		assert.equal(storage.data.cardTombstones["first-card"]?.lapseCount, 1);
		assert.equal(storage.data.reviewStates["first-card"], undefined);
		assert.equal(storage.data.conceptSourceLinks["link-first"], undefined);
		assert.deepEqual(storage.data.conceptSourceLinks["link-other"], before.conceptSourceLinks["link-other"]);
		assert.deepEqual(storage.data.sourceAnalysisRecords["Source.md"], { ...before.sourceAnalysisRecords["Source.md"], linkedConceptIds: ["concept-other"] });
		assert.deepEqual(storage.data.reviewEvents, before.reviewEvents);
		assert.deepEqual(storage.data.settings, before.settings);
		assert.deepEqual(storage.data.knowledgeProposals, before.knowledgeProposals);
		assert.deepEqual(storage.data.manualCardDraft, before.manualCardDraft);
		assert.doesNotMatch(JSON.stringify(storage.data.conceptDeletions), /MNEME|# First|prose|first-card/);
	}

	// Before/after failures in each filesystem operation leave a pending receipt for Resume.
	for (const failure of [
		{ kind: "process" as const, call: 1 }, { kind: "process" as const, call: 1, after: true },
		{ kind: "rename" as const, call: 2 }, { kind: "rename" as const, call: 2, after: true },
		{ kind: "trash" as const, call: 3 }, { kind: "trash" as const, call: 3, after: true },
		{ kind: "rename" as const, call: 4 }, { kind: "rename" as const, call: 4, after: true },
		{ kind: "trash" as const, call: 5 }, { kind: "trash" as const, call: 5, after: true },
	]) {
		const storage = new MemoryStorage(); const vault = new MemoryVault(failure);
		await rejects(new RecoverableConceptDeletion(vault, storage, () => `${failure.kind}-${failure.after ? "after" : "before"}`).delete(plan()), /before|after/);
		await new RecoverableConceptDeletion(vault, storage).resume();
		await assertCompleted(storage, vault);
	}

	// A post-rename edit is preserved by restoring the original path; Resume must block rather than overwrite.
	{
		const storage = new MemoryStorage(); const vault = new MemoryVault();
		const originalRename = vault.rename.bind(vault);
		vault.rename = async (path, destination) => {
			await originalRename(path, destination);
			if (path === conceptPath) vault.files.set(destination, "edited while staged");
		};
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "edited-stage").delete(plan()), /changed or moved/);
		assert.equal(await vault.read(conceptPath), "edited while staged");
		assert.equal(await vault.exists(`${conceptPath}.mneme-delete-edited-stage`), false);
	}

	// An intent that applied before failure blocks duplicate delete calls; Resume is the only continuation.
	{
		const storage = new MemoryStorage({ save: 1, afterSave: true }); const vault = new MemoryVault();
		const service = new RecoverableConceptDeletion(vault, storage, () => "duplicate");
		await rejects(service.delete(plan()), /save-1/);
		await rejects(service.delete(plan()), /deleted or a deletion is pending/);
		await service.resume();
	}

	// Pending ratings are rejected even after a failed attempt releases the queue.
	{
		const storage = new MemoryStorage({ save: 1, afterSave: true });
		const vault = new MemoryVault();
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "pending-rating").delete(plan()), /save-/);
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await assert.rejects(reviews.recordReview("first-card", "good"), /deletion is pending/);
		assert.deepEqual(storage.data.reviewEvents, {});
	}

	// Preserve changed staging files and recreated original paths during recovery.
	for (const conflict of ["stage", "original", "related"] as const) {
		const storage = new MemoryStorage({ save: 2, afterSave: true });
		const vault = new MemoryVault();
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "conflict").delete(plan()), /save-/);
		const path = conflict === "stage" ? `${cardsPath}.mneme-delete-conflict` : conflict === "original" ? cardsPath : relatedPath;
		vault.files.set(path, "new learner content");
		await rejects(new RecoverableConceptDeletion(vault, storage).resume(), /changed or moved/);
		assert.equal(await vault.read(path), "new learner content");
		assert.equal(vault.trashCount, 0);
		assert.deepEqual(storage.data.cardTombstones, {});
	}

	// A late edit inside process is rejected at the actual write, not just preflight.
	{
		const storage = new MemoryStorage(); const vault = new MemoryVault();
		const process = vault.process.bind(vault);
		vault.process = async (path, transform) => {
			vault.files.set(path, relatedMarkdown + "Learner edit");
			await process(path, transform);
		};
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "process-edit").delete(plan()), /changed or moved/);
		assert.equal(await vault.read(relatedPath), relatedMarkdown + "Learner edit");
		assert.equal(vault.trashCount, 0);
	}

	// The real prepare -> delete path uses the resolver matcher for a bare target.
	{
		const storage = new MemoryStorage();
		const vault = new MemoryVault();
		vault.files.set(relatedPath, relatedMarkdown.replace("[[Mneme/Concepts/First|First]]", "[[First|First]]"));
		vault.resolveLinkpath = (linkpath) => linkpath === "First" ? conceptPath : undefined;
		const prepared = await new ConceptDeletionService(vault).prepare(
			{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" },
			[{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" }, { conceptId: "concept-second", path: relatedPath, title: "Second" }],
		);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		await new RecoverableConceptDeletion(vault, storage, () => "prepared-bare").delete(prepared.plan);
		assert.doesNotMatch(await vault.read(relatedPath), /\[\[First/);
	}

	// Prepare, then recover an intent that failed after saving: a bare link to
	// another same-name Concept survives while the qualified target is removed.
	{
		const before = relatedMarkdown.replace(
			"[[Mneme/Concepts/First|First]]",
			"[[First|Archived First]]\n- [[Mneme/Concepts/First|First]]",
		);
		const storage = new MemoryStorage({ save: 1, afterSave: true });
		const vault = new MemoryVault();
		vault.files.set(relatedPath, before);
		vault.resolveLinkpath = (linkpath) => linkpath === "First" ? "Archive/First.md" : undefined;
		const prepared = await new ConceptDeletionService(vault).prepare(
			{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" },
			[{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" }, { conceptId: "concept-second", path: relatedPath, title: "Second" }],
		);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.equal(prepared.plan.relatedWrites.length, 1);
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "mixed-resume").delete(prepared.plan), /save-/);
		await new RecoverableConceptDeletion(vault, storage).resume();
		const remaining = await vault.read(relatedPath);
		assert.match(remaining, /\[\[First\|Archived First\]\]/);
		assert.doesNotMatch(remaining, /Mneme\/Concepts\/First/);
	}

	// A pending intent resumes with the original matcher, and rejects if the
	// resolver now points the same bare link at another file.
	{
		const before = relatedMarkdown.replace("[[Mneme/Concepts/First|First]]", "[[First|First]]");
		const after = removeRelatedConceptLink(before, conceptPath, () => true).markdown;
		const storage = new MemoryStorage({ save: 1, afterSave: true });
		const vault = new MemoryVault();
		vault.files.set(relatedPath, before);
		vault.resolveLinkpath = (linkpath) => linkpath === "First" ? conceptPath : undefined;
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "bare-resume").delete(planWithChecks(before, after)), /save-/);
		await new RecoverableConceptDeletion(vault, storage).resume();
		assert.doesNotMatch(await vault.read(relatedPath), /\[\[First/);

		const conflictStorage = new MemoryStorage({ save: 1, afterSave: true });
		const conflictVault = new MemoryVault();
		conflictVault.files.set(relatedPath, before);
		conflictVault.resolveLinkpath = (linkpath) => linkpath === "First" ? conceptPath : undefined;
		await rejects(new RecoverableConceptDeletion(conflictVault, conflictStorage, () => "bare-change").delete(planWithChecks(before, after)), /save-/);
		conflictVault.resolveLinkpath = () => "Archive/First.md";
		await rejects(new RecoverableConceptDeletion(conflictVault, conflictStorage).resume(), /changed or moved|conflict|matcher|resolve/);
		assert.equal(await conflictVault.read(relatedPath), before);
		assert.equal(conflictVault.trashCount, 0);
	}

	// If the related process applied successfully but reported after=true, the
	// receipt hash lets Resume skip the matcher after resolution becomes unavailable.
	{
		const before = relatedMarkdown.replace("[[Mneme/Concepts/First|First]]", "[[First|First]]");
		const after = removeRelatedConceptLink(before, conceptPath, () => true).markdown;
		const storage = new MemoryStorage();
		const vault = new MemoryVault({ kind: "process", call: 1, after: true });
		vault.files.set(relatedPath, before);
		vault.resolveLinkpath = (linkpath) => linkpath === "First" ? conceptPath : undefined;
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "after-process").delete(planWithChecks(before, after)), /process-after/);
		vault.resolveLinkpath = undefined;
		await new RecoverableConceptDeletion(vault, storage).resume();
		assert.equal(await vault.read(relatedPath), after);
		assert.equal(vault.trashCount, 2);
	}

	// Both adding and removing a cleanup decision invalidate the prepared plan
	// before saving intent or writing Markdown.
	for (const initialTarget of ["Archive/First.md", conceptPath]) {
		const before = relatedMarkdown.replace("[[Mneme/Concepts/First|First]]", "[[First|First]]");
		const storage = new MemoryStorage();
		const vault = new MemoryVault();
		vault.files.set(relatedPath, before);
		vault.resolveLinkpath = () => initialTarget;
		const prepared = await new ConceptDeletionService(vault).prepare(
			{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" },
			[{ conceptId: "concept-first", path: conceptPath, cardsPath, title: "First" }, { conceptId: "concept-second", path: relatedPath, title: "Second" }],
		);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.equal(prepared.plan.relatedWrites.length, initialTarget === conceptPath ? 1 : 0);
		const allFiles = new Map(vault.files);
		const allData = structuredClone(storage.data);
		vault.resolveLinkpath = () => initialTarget === conceptPath ? "Archive/First.md" : conceptPath;
		await rejects(new RecoverableConceptDeletion(vault, storage, () => "noop-change").delete(prepared.plan), /changed|conflict|matcher|resolve/);
		assert.equal(storage.data.conceptDeletions, undefined);
		assert.equal(await vault.read(relatedPath), before);
		assert.deepEqual(vault.files, allFiles);
		assert.deepEqual(storage.data, allData);
		assert.equal(vault.trashCount, 0);
	}

	// Validate each malformed field against an otherwise valid persisted intent.
	const journalStorage = new MemoryStorage({ save: 1, afterSave: true });
	await rejects(new RecoverableConceptDeletion(new MemoryVault(), journalStorage, () => "validation").delete(plan()), /save-/);
	const journal = readConceptDeletions(journalStorage.data.conceptDeletions);
	const pending = journal["concept-first"]!;
	assert.equal(pending.status, "pending");
	if (pending.status !== "pending") throw new Error("Expected pending fixture");
	for (const invalid of [
		{ ...pending, operationId: "../escape" },
		{ ...pending, files: pending.files.map((file) => ({ ...file, path: "../outside.md" })) },
		{ ...pending, files: pending.files.map((file) => ({ ...file, stagePath: "unrelated.md" })) },
		{ ...pending, cardIds: ["first-card", "first-card"] },
		{ ...pending, files: pending.files.map((file) => ({ ...file, hash: "not-a-hash" })) },
		{ ...pending, conceptId: "wrong-key" },
	]) {
		const storage = new MemoryStorage();
		storage.data.conceptDeletions = { "concept-first": invalid };
		const originalData = structuredClone(storage.data);
		const vault = new MemoryVault();
		vault.exists = vault.read = async () => { throw new Error("Unexpected Vault I/O"); };
		await rejects(new RecoverableConceptDeletion(vault, storage).resume(), /journal is invalid/);
		assert.deepEqual(storage.data, originalData);
	}

	assert.notEqual(await deletionContentHash("x\r\n"), await deletionContentHash("x\n"), "deletion hashes retain newline changes");
	console.log("Recoverable Concept deletion tests passed.");
}

function seedState(storage: MemoryStorage): void {
	const at = "2026-09-08T00:00:00.000Z";
	storage.data.reviewStates["first-card"] = { cardId: "first-card", createdAt: at, updatedAt: at, reviewCount: 3, lapseCount: 1 };
	storage.data.reviewEvents["event-first"] = { eventId: "event-first", cardId: "first-card", rating: "good", reviewedAt: at };
	for (const id of ["first", "other"]) storage.data.conceptSourceLinks[`link-${id}`] = {
		id: `link-${id}`, conceptId: `concept-${id}`, sourcePath: "Source.md", sourceHash: "a".repeat(64),
		addedAt: at, lastSeenAt: at, evidence: [], relationType: "origin", status: "approved",
	};
	storage.data.sourceAnalysisRecords["Source.md"] = { sourcePath: "Source.md", contentHash: "a".repeat(64),
		lastAnalyzedAt: at, linkedConceptIds: ["concept-first", "concept-other"], pendingProposalIds: ["proposal-first"], mtime: 10, size: 20, status: "clean" };
	storage.data.knowledgeProposals["proposal-first"] = { id: "proposal-first", kind: "new_card", status: "suggested", createdAt: at, updatedAt: at,
		payload: { conceptId: "concept-first", card: { cardType: "definition", front: "Draft front prose", back: "Draft back prose" } } };
	storage.data.manualCardDraftId = "draft-first";
	storage.data.manualCardDraft = { draftId: "draft-first", conceptId: "concept-first", cardType: "definition", front: "Manual prose", back: "Back prose", rubric: "", updatedAt: at };
}

export const done = run();
