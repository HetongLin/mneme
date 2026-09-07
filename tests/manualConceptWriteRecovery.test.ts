import assert from "node:assert/strict";
import type { ManualConceptDraft } from "../src/models/manualConceptDraft";
import type { MnemePluginData } from "../src/models/reviewState";
import type { PluginDataStorage } from "../src/services/pluginDataMutation";
import { computeContentHash } from "../src/utils/sourceHash";
import type { ManualConceptVault } from "../src/services/manualConceptService";
import { createDefaultPluginData, normalizePluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { ManualConceptDraftStore } from "../src/services/manualConceptDraftStore";
import { createManualConceptWithRecovery } from "../src/services/manualConceptWriteService";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { DEFAULT_SETTINGS } from "../src/models/settings";

class Storage implements PluginDataStorage {
	data: MnemePluginData;
	failSaveOnce = false;
	failSaveWhen?: (data: MnemePluginData) => boolean;
	throwAfterSaveWhen?: (data: MnemePluginData) => boolean;
	constructor(data: unknown) { this.data = normalizePluginData(structuredClone(data)); }
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		if (this.failSaveOnce || this.failSaveWhen?.(data)) { this.failSaveOnce = false; this.failSaveWhen = undefined; throw new Error("Injected save failure"); }
		this.data = structuredClone(data);
		if (this.throwAfterSaveWhen?.(data)) { this.throwAfterSaveWhen = undefined; throw new Error("Injected after-save failure"); }
	}
}

class Vault implements ManualConceptVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	creates = 0;
	failCreate = false;
	throwAfterCreate = false;
	private barrier?: { promise: Promise<void>; entered: () => void };
	armCreateBarrier(): { entered: Promise<void>; release: () => void } {
		let release!: () => void;
		let entered!: () => void;
		const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
		this.barrier = { promise: new Promise<void>((resolve) => { release = resolve; }), entered };
		return { entered: enteredPromise, release };
	}
	constructor(initial: Record<string, string> = {}) { for (const [path, content] of Object.entries(initial)) this.files.set(path, content); }
	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.folders.has(path); }
	async read(path: string): Promise<string> { const value = this.files.get(path); if (value === undefined) throw new Error(`Missing ${path}`); return value; }
	async createFolder(path: string): Promise<void> { this.folders.add(path); }
	async create(path: string, content: string): Promise<void> {
		if (this.barrier) { const barrier = this.barrier; this.barrier = undefined; barrier.entered(); await barrier.promise; }
		this.creates += 1;
		if (this.failCreate) { this.failCreate = false; throw new Error("Injected create failure"); }
		if (this.files.has(path)) throw new Error("already exists");
		this.files.set(path, content);
		if (this.throwAfterCreate) { this.throwAfterCreate = false; throw new Error("Injected after-create failure"); }
	}
}

const settings = DEFAULT_SETTINGS;
const draft = (draftId: string, sourcePath?: string): ManualConceptDraft => ({
	draftId, coreMeaning: "A manually authored concept.", englishName: "", importance: "normal", learningMode: "reviewable",
	...(sourcePath ? { sourcePath } : {}), tags: ["manual"], title: "Manual Concept", updatedAt: "2026-09-07T00:00:00.000Z", whyItMatters: "Useful.",
});
const source = { contentHash: "a".repeat(64), mtime: 100, path: "Notes/Source.md", size: 123 };
const sourceRecord = { conceptCaptureFingerprint: "capture-fingerprint", contentHash: "a".repeat(64), lastAnalyzedAt: "2026-09-06T00:00:00.000Z", linkedConceptIds: ["concept-old"], mtime: 90, pendingProposalIds: ["proposal-pending"], size: 100, sourcePath: source.path, status: "clean" as const };
const baseData = () => { const data = createDefaultPluginData(); data.sourceAnalysisRecords[source.path] = sourceRecord; return data; };

async function prepare(storage: Storage, value: ManualConceptDraft): Promise<ManualConceptDraft> {
	const store = new ManualConceptDraftStore(storage);
	const current = await store.getDraft();
	const persisted = { ...value, draftId: current.draftId };
	await store.saveDraft(persisted);
	return persisted;
}

async function run(): Promise<void> {
	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, { ...draft("draft-names"), title: "概念 (First) (Second)" });
		const vault = new Vault();
		const result = await createManualConceptWithRecovery(actual, { ...settings, suggestEnglishAliases: true }, vault, storage,
			{ createId: () => "concept-names" });
		assert.equal(vault.files.size, 1, "fresh planning and recovery use identical name normalization");
		assert.equal(await computeContentHash(await vault.read(result.path)), storage.data.manualConceptWrite?.afterHash);
	}
	for (const withSource of [false, true]) {
		for (const stage of ["intent-before", "intent-after", "create-before", "create-after", "completion-before", "completion-after"] as const) {
			const storage = new Storage(baseData());
			const vault = new Vault();
			const actual = await prepare(storage, draft("draft-a", withSource ? source.path : undefined));
			if (stage === "create-before") vault.failCreate = true;
			if (stage === "create-after") vault.throwAfterCreate = true;
			if (stage === "intent-before") storage.failSaveOnce = true;
			if (stage === "completion-before") storage.failSaveWhen = (data) => data.manualConceptWrite?.status === "written";
			if (stage === "intent-after" || stage === "completion-after") {
				storage.throwAfterSaveWhen = (data) => data.manualConceptWrite?.status === (stage === "intent-after" ? "pending" : "written");
			}
			await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, storage, {
				createId: () => "concept-manual-1", readSourceSnapshot: async () => source,
			}), /Injected/);
			const alreadyCreated = stage === "create-after" || stage.startsWith("completion");
			assert.equal(vault.files.size, alreadyCreated ? 1 : 0, stage);
			assert.equal(storage.data.manualConceptWrite?.status,
				stage === "intent-before" ? undefined : stage === "completion-after" ? "written" : "pending", stage);
			if (stage !== "completion-after") assert.equal(storage.data.manualConceptDraft?.draftId, actual.draftId);

			const snapshot = [...vault.files.entries()];
			const retryStorage = new Storage(storage.data);
			const retryVault = new Vault(Object.fromEntries(snapshot));
			const options = {
				createId: () => { assert.equal(stage, "intent-before", "saved identity must be reused"); return "concept-manual-1"; },
				readSourceSnapshot: async () => { assert.equal(stage, "intent-before", "saved source must be reused"); return source; },
			};
			const result = await createManualConceptWithRecovery(actual, settings, retryVault, retryStorage, options);
			assert.equal(result.conceptId, "concept-manual-1");
			assert.equal(result.path, "Mneme/Concepts/Manual-Concept.md");
			assert.equal(retryVault.files.size, 1);
			assert.equal(retryVault.creates, alreadyCreated ? 0 : 1);
			assert.match(await retryVault.read(result.path), /^mneme_id: concept-manual-1$/m);
			assert.equal(await computeContentHash(await retryVault.read(result.path)), retryStorage.data.manualConceptWrite?.afterHash);
			if (alreadyCreated) assert.deepEqual([...retryVault.files.entries()], snapshot);
			assert.equal(retryStorage.data.manualConceptWrite?.status, "written");
			assert.equal(result.nextDraft.title, "");
			assert.equal(result.nextDraft.coreMeaning, "");
			assert.equal(result.nextDraft.sourcePath, withSource ? source.path : undefined);
			assert.notEqual(result.nextDraft.draftId, actual.draftId);
			assert.deepEqual(retryStorage.data.manualConceptDraft, result.nextDraft);
			assert.equal(result.nextDraft.draftId, retryStorage.data.manualConceptDraftId);
			const record = retryStorage.data.sourceAnalysisRecords[source.path];
			assert.deepEqual(record?.linkedConceptIds, withSource ? ["concept-old", result.conceptId] : ["concept-old"]);
			assert.deepEqual(record?.pendingProposalIds, ["proposal-pending"]);
			assert.equal(record?.conceptCaptureFingerprint, "capture-fingerprint");
			const links = Object.values(retryStorage.data.conceptSourceLinks);
			assert.equal(links.length, withSource ? 1 : 0);
			if (withSource) {
				assert.equal(links[0]?.conceptId, result.conceptId);
				assert.equal(links[0]?.sourceHash, source.contentHash);
				assert.equal(links[0]?.relationType, "origin");
			}
			const completed = structuredClone(retryStorage.data);
			const fileCount = retryVault.creates;
			assert.deepEqual(await createManualConceptWithRecovery(actual, settings, retryVault, retryStorage, options), result);
			assert.deepEqual(retryStorage.data, completed);
			assert.equal(retryVault.creates, fileCount, "completed request must not write again");
		}
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-pending"));
		const vault = new Vault();
		vault.failCreate = true;
		await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-pending" }));
		const store = new ManualConceptDraftStore(storage);
		const state = await store.getState();
		assert.equal(state.pendingWrite?.status, "pending");
		await assert.rejects(store.saveDraft(state.draft), /pending/i);
		await assert.rejects(store.clearDraft(state.draft.draftId!), /pending/i);
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-legacy"));
		const vault = new Vault();
		const result = await createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-legacy" });
		const oldId = actual.draftId;
		const next = result.nextDraft;
		assert.notEqual(next.draftId, oldId);
		const store = new ManualConceptDraftStore(storage);
		await assert.rejects(store.saveDraft(actual), /out of date|draft/i);
		await assert.rejects(store.clearDraft(oldId!), /out of date|draft/i);
		const sameText = { ...actual, draftId: next.draftId };
		await store.saveDraft(sameText);
		const second = await createManualConceptWithRecovery(sameText, settings, vault, storage, { createId: () => "concept-legacy-2" });
		assert.notEqual(second.conceptId, result.conceptId);
		assert.notEqual(second.path, result.path);
		assert.equal(vault.files.size, 2);
	}

	{
		const legacy = createDefaultPluginData();
		legacy.manualConceptDraft = { ...draft("legacy-fixed") };
		delete legacy.manualConceptDraft.draftId;
		const storage = new Storage(legacy);
		const first = await new ManualConceptDraftStore(storage).getDraft();
		const second = await new ManualConceptDraftStore(storage).getDraft();
		assert.ok(first.draftId);
		assert.equal(first.title, legacy.manualConceptDraft.title);
		assert.equal(first.draftId, second.draftId);
		assert.equal(storage.data.manualConceptDraftId, first.draftId);
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-a"));
		const vault = new Vault();
		storage.failSaveWhen = (data) => data.manualConceptWrite?.status === "written";
		await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-manual-1" }));
		const path = storage.data.manualConceptWrite!.path;
		const edited = `${await vault.read(path)}\nEdited by learner\n`;
		vault.files.set(path, edited);
		await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, new Storage(storage.data), { createId: () => "concept-manual-1" }), /edited|occupied|changed/i);
		assert.equal(await vault.read(path), edited);
		assert.equal(vault.creates, 1);
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-a", source.path));
		const vault = new Vault();
		const result = await createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-source", readSourceSnapshot: async () => source });
		assert.equal(result.conceptId, "concept-source");
		assert.deepEqual(storage.data.sourceAnalysisRecords[source.path]?.linkedConceptIds, ["concept-old", "concept-source"]);
		assert.deepEqual(storage.data.sourceAnalysisRecords[source.path]?.pendingProposalIds, ["proposal-pending"]);
		assert.equal(Object.values(storage.data.conceptSourceLinks).length, 1);
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-source-change", source.path));
		const vault = new Vault();
		vault.failCreate = true;
		await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, storage,
			{ createId: () => "concept-source-change", readSourceSnapshot: async () => source }));
		storage.data.sourceAnalysisRecords[source.path] = {
			...sourceRecord, contentHash: "b".repeat(64), conceptCaptureFingerprint: "new-capture-fingerprint",
			pendingProposalIds: ["new-source-proposal"],
		};
		await createManualConceptWithRecovery(actual, settings, vault, storage, {
			readSourceSnapshot: async () => { throw new Error("Source moved after the saved intent"); },
		});
		const record = storage.data.sourceAnalysisRecords[source.path];
		assert.equal(record?.status, "stale");
		assert.equal(record?.conceptCaptureFingerprint, "new-capture-fingerprint");
		assert.deepEqual(record?.pendingProposalIds, ["new-source-proposal"]);
		assert.equal(Object.values(storage.data.conceptSourceLinks)[0]?.sourceHash, source.contentHash,
			"origin identifies the saved input, not the later Source revision");
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, { ...draft("draft-settings"), title: "向量空间", englishName: "Vector Space" });
		const vault = new Vault();
		vault.failCreate = true;
		await assert.rejects(createManualConceptWithRecovery(actual, { ...settings, suggestEnglishAliases: true }, vault, storage,
			{ createId: () => "concept-settings" }), /Injected/);
		const receipt = structuredClone(storage.data.manualConceptWrite!);
		const changed = { ...settings, suggestEnglishAliases: false, conceptsFolder: "Changed/Concepts", cardsFolder: "Changed/Cards" };
		const retryVault = new Vault();
		const retry = await createManualConceptWithRecovery(actual, changed, retryVault, new Storage(storage.data));
		assert.equal(retry.path, receipt.path);
		const markdown = await retryVault.read(retry.path);
		assert.match(markdown, /mneme_english_name: "Vector Space"/);
		assert.equal(await computeContentHash(markdown), receipt.afterHash);
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-invalid"));
		const vault = new Vault();
		vault.failCreate = true;
		await assert.rejects(createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-invalid" }));
		const receipt = storage.data.manualConceptWrite!;
		for (const invalid of [
			{ ...receipt, path: "../Outside.md" }, { ...receipt, cardsPath: "/Outside.md" },
			{ ...receipt, draftId: 123 }, { ...receipt, afterHash: "invalid" },
			{ ...receipt, source: { ...source, size: -1 } }, { ...receipt, status: "unknown" },
		]) {
			const malformed = new Storage({ ...storage.data, manualConceptWrite: invalid });
			const before = structuredClone(malformed.data);
			const emptyVault = new Vault();
			const store = new ManualConceptDraftStore(malformed);
			await assert.rejects(store.getState(), /invalid/);
			await assert.rejects(store.saveDraft(actual), /invalid/);
			await assert.rejects(store.clearDraft(actual.draftId!), /invalid/);
			await assert.rejects(createManualConceptWithRecovery(actual, settings, emptyVault, malformed), /invalid/);
			assert.deepEqual(malformed.data, before);
			assert.equal(emptyVault.creates, 0);
			assert.equal(emptyVault.files.size, 0);
		}
	}

	{
		const storage = new Storage(baseData());
		const actual = await prepare(storage, draft("draft-a"));
		const vault = new Vault();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
		await reviews.load();
		const barrier = vault.armCreateBarrier();
		const writing = createManualConceptWithRecovery(actual, settings, vault, storage, { createId: () => "concept-review" });
		await barrier.entered;
		let reviewFinished = false;
		const reviewing = reviews.recordReview("card-review", "good").then(() => { reviewFinished = true; });
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.equal(reviewFinished, false, "Review must wait while Concept creation holds the shared queue");
		assert.equal(storage.data.reviewStates["card-review"], undefined);
		barrier.release();
		await Promise.all([writing, reviewing]);
		assert.equal(storage.data.reviewStates["card-review"]?.lastRating, "good");
		assert.equal(storage.data.manualConceptWrite?.status, "written");
	}
}

export const done = run();
