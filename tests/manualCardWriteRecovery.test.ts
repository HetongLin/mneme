import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import type { ManualCardDraft } from "../src/models/manualCardDraft";
import type { PluginDataStorage } from "../src/services/pluginDataMutation";
import { renderManualCard, type ManualCardVault } from "../src/services/manualCardService";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { appendCardGroupDraft } from "../src/services/cardGroupWriter";
import { ManualCardDraftStore } from "../src/services/manualCardDraftStore";
import { ReviewStateStore, normalizePluginData } from "../src/services/reviewStateStore";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { createManualCardWithRecovery } from "../src/services/manualCardWriteService";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

class Storage implements PluginDataStorage {
	data: MnemePluginData;
	failSaveOnce = false;
	failSaveWhen?: (data: MnemePluginData) => boolean;
	throwAfterSaveOnce = false;
	throwAfterSaveWhen?: (data: MnemePluginData) => boolean;
	constructor(data: unknown) { this.data = normalizePluginData(structuredClone(data)); }
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		if (this.failSaveOnce || this.failSaveWhen?.(data)) {
			this.failSaveOnce = false;
			this.failSaveWhen = undefined;
			throw new Error("Injected save failure");
		}
		this.data = structuredClone(data);
		if (this.throwAfterSaveOnce || this.throwAfterSaveWhen?.(data)) {
			this.throwAfterSaveOnce = false;
			this.throwAfterSaveWhen = undefined;
			throw new Error("Injected after-save failure");
		}
	}
}

class Vault implements ManualCardVault {
	files = new Map<string, string>();
	creates = 0;
	processes = 0;
	failCreate = false;
	failProcess = false;
	throwAfterCreate = false;
	throwAfterProcess = false;
	constructor(initial: Record<string, string> = {}) { for (const [path, content] of Object.entries(initial)) this.files.set(path, content); }
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async read(path: string): Promise<string> { const content = this.files.get(path); if (content === undefined) throw new Error(`Missing ${path}`); return content; }
	async createFolder(): Promise<void> {}
	async create(path: string, content: string): Promise<void> {
		this.creates += 1;
		if (this.failCreate) { this.failCreate = false; throw new Error("Injected create failure"); }
		if (this.files.has(path)) throw new Error("already exists");
		this.files.set(path, content);
		if (this.throwAfterCreate) { this.throwAfterCreate = false; throw new Error("Injected after-create failure"); }
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.processes += 1;
		if (this.failProcess) { this.failProcess = false; throw new Error("Injected process failure"); }
		const current = await this.read(path);
		this.files.set(path, transform(current));
		if (this.throwAfterProcess) { this.throwAfterProcess = false; throw new Error("Injected after-process failure"); }
	}
}

const concept: ConceptSummary = {
	conceptId: "concept-manual", path: "Mneme/Concepts/Manual.md", title: "Manual",
	cardsPath: "Mneme/Cards/Manual/Cards.md",
};
const cardsPath = concept.cardsPath!;
const prose = { front: "What is manual?", back: "A manually authored card.", rubric: "Mention authorship.", cardType: "definition" as const, conceptId: concept.conceptId };

async function saveNewDraft(storage: Storage): Promise<ManualCardDraft> {
	const store = new ManualCardDraftStore(storage);
	const draft = { ...await store.getDraft(), ...prose };
	await store.saveDraft(draft);
	return draft;
}

function write(draft: ManualCardDraft, storage: Storage, vault: Vault) {
	let id = 0;
	return createManualCardWithRecovery(draft, concept, DEFAULT_SETTINGS, vault, storage, new Set(), () => `card-manual-${++id}`);
}

function reload(storage: Storage, vault: Vault) {
	return { storage: new Storage(storage.data), vault: new Vault(Object.fromEntries(vault.files)) };
}

function cardIds(vault: Vault): string[] {
	return parseMnemeCards(vault.files.get(cardsPath) ?? "").map((card) => card.explicitCardId!);
}

const originalGroup = renderManualCard({ ...prose, front: "Existing question", back: "Existing answer", concept }, "card-existing");

type Fault = "intent-before" | "intent-after" | "markdown-before" | "markdown-after" | "completion-before" | "completion-after";

async function run(): Promise<void> {
	{
		const storage = new Storage(createDefaultPluginData());
		const draft = await saveNewDraft(storage);
		storage.data.conceptDeletions = { [concept.conceptId]: {
			version: 1, status: "deleted", operationId: "delete-test", conceptId: concept.conceptId,
			createdAt: "2026-09-08T00:00:00.000Z", completedAt: "2026-09-08T00:00:00.000Z", conceptPath: concept.path,
		} };
		const vault = new Vault();
		await assert.rejects(write(draft, storage, vault), /deletion/);
		assert.equal(vault.creates + vault.processes, 0);
		assert.deepEqual(storage.data.manualCardDraft, draft);
	}

	// Exercise the actual coordinator, recreating both storage and Vault after every fault.
	for (const existing of [false, true]) {
		for (const fault of ["intent-before", "intent-after", "markdown-before", "markdown-after", "completion-before", "completion-after"] as Fault[]) {
			const storage = new Storage(createDefaultPluginData());
			const vault = new Vault(existing ? { [cardsPath]: originalGroup } : {});
			const draft = await saveNewDraft(storage);
			if (fault === "intent-before") storage.failSaveWhen = (data) => data.manualCardWrite?.status === "pending";
			if (fault === "intent-after") storage.throwAfterSaveWhen = (data) => data.manualCardWrite?.status === "pending";
			if (fault === "markdown-before") {
				if (existing) vault.failProcess = true;
				else vault.failCreate = true;
			}
			if (fault === "markdown-after") {
				if (existing) vault.throwAfterProcess = true;
				else vault.throwAfterCreate = true;
			}
			if (fault === "completion-before") storage.failSaveWhen = (data) => data.manualCardWrite?.status === "written";
			if (fault === "completion-after") storage.throwAfterSaveWhen = (data) => data.manualCardWrite?.status === "written";
			await assert.rejects(write(draft, storage, vault), /Injected/);
			if (fault.startsWith("intent")) {
				assert.equal(vault.creates + vault.processes, 0, "intent persistence precedes all Markdown writes");
			}
			const savedReceipt = storage.data.manualCardWrite;
			const restarted = reload(storage, vault);
			const pending = await new ManualCardDraftStore(restarted.storage).getState();
			if (savedReceipt?.status === "pending") assert.equal(pending.pendingWrite?.draftId, draft.draftId);
			const result = await write(draft, restarted.storage, restarted.vault);
			assert.deepEqual(cardIds(restarted.vault), [...(existing ? ["card-existing"] : []), result.cardId]);
			if (savedReceipt) assert.equal(result.cardId, savedReceipt.cardId, `${fault}: reserved identity survives reload`);
			if (["markdown-after", "completion-before", "completion-after"].includes(fault)) {
				assert.equal(restarted.vault.creates + restarted.vault.processes, 0, `${fault}: applied Markdown must not be replayed`);
			}
			assert.equal(restarted.storage.data.manualCardWrite?.status, "written");
			assert.equal(restarted.storage.data.manualCardDraft, undefined);
			assert.equal(restarted.storage.data.manualCardDraftId, result.nextDraft.draftId);
			assert.notEqual(result.nextDraft.draftId, draft.draftId);
			const completedStore = new ManualCardDraftStore(restarted.storage);
			await assert.rejects(completedStore.saveDraft(draft), /out of date/);
			await assert.rejects(completedStore.clearDraft(draft.draftId!), /out of date/);
			const before = [...restarted.vault.files];
			assert.equal((await write(draft, restarted.storage, restarted.vault)).cardId, result.cardId);
			assert.deepEqual([...restarted.vault.files], before, "duplicate completion request is read-only");
		}
	}

	{
		const legacy = { ...prose, updatedAt: "2026-09-06T00:00:00.000Z" };
		const storage = new Storage({ ...createDefaultPluginData(), manualCardDraft: legacy });
		const store = new ManualCardDraftStore(storage);
		const migrated = await store.getDraft();
		assert.ok(migrated.draftId);
		assert.deepEqual({ ...migrated, draftId: undefined }, { ...legacy, draftId: undefined });
		assert.deepEqual(await new ManualCardDraftStore(new Storage(storage.data)).getDraft(), migrated);
	}

	{
		const storage = new Storage(createDefaultPluginData());
		const vault = new Vault();
		const draft = await saveNewDraft(storage);
		vault.failCreate = true;
		await assert.rejects(write(draft, storage, vault), /Injected/);
		const store = new ManualCardDraftStore(storage);
		await assert.rejects(store.saveDraft({ ...draft, front: "Changed input" }), /pending/);
		await assert.rejects(store.clearDraft(draft.draftId!), /pending/);
		await assert.rejects(write({ ...draft, back: "Changed input" }, storage, vault), /draft has changed/);
		const restarted = reload(storage, vault);
		// The original Concept need not remain in the library, and settings must not retarget recovery.
		const result = await createManualCardWithRecovery(draft, undefined, { ...DEFAULT_SETTINGS, cardsFolder: "Changed" }, restarted.vault, restarted.storage);
		assert.equal(result.cardsPath, cardsPath);
		assert.deepEqual(cardIds(restarted.vault), [result.cardId]);
	}

	{
		const storage = new Storage(createDefaultPluginData());
		const vault = new Vault();
		const firstDraft = await saveNewDraft(storage);
		const first = await write(firstDraft, storage, vault);
		const secondDraft = await saveNewDraft(storage);
		assert.notEqual(firstDraft.draftId, secondDraft.draftId);
		const second = await write(secondDraft, storage, vault);
		assert.notEqual(first.cardId, second.cardId, "same prose in a new draft is intentional new authorship");
		assert.deepEqual(cardIds(vault), [first.cardId, second.cardId]);
		await assert.rejects(write(firstDraft, storage, vault), /out of date/);
	}

	{
		const storage = new Storage(createDefaultPluginData());
		const vault = new Vault();
		const draft = await saveNewDraft(storage);
		storage.failSaveWhen = (data) => data.manualCardWrite?.status === "written";
		await assert.rejects(write(draft, storage, vault), /Injected/);
		const appended = appendCardGroupDraft(await vault.read(cardsPath), originalGroup);
		assert.notEqual(appended.status, "invalid");
		if (appended.status === "invalid") throw new Error(appended.message);
		vault.files.set(cardsPath, `${appended.markdown}\nUser's unrelated note.\n`);
		const restarted = reload(storage, vault);
		const before = await restarted.vault.read(cardsPath);
		const result = await write(draft, restarted.storage, restarted.vault);
		assert.deepEqual(cardIds(restarted.vault), [result.cardId, "card-existing"]);
		assert.equal(await restarted.vault.read(cardsPath), before);
		assert.equal(restarted.vault.processes, 0);
	}

	for (const edit of ["card", "missing-group", "different-owner", "moved-id"] as const) {
		const storage = new Storage(createDefaultPluginData());
		const vault = new Vault({ [cardsPath]: originalGroup });
		const draft = await saveNewDraft(storage);
		if (edit === "card") vault.throwAfterProcess = true;
		else vault.failProcess = true;
		await assert.rejects(write(draft, storage, vault), /Injected/);
		if (edit === "card") vault.files.set(cardsPath, (await vault.read(cardsPath)).replace(prose.back, "User-edited answer."));
		if (edit === "missing-group") vault.files.delete(cardsPath);
		if (edit === "different-owner") vault.files.set(cardsPath, originalGroup.replace(concept.conceptId, "concept-other"));
		const restarted = reload(storage, vault);
		const before = [...restarted.vault.files];
		const ids = new Set(edit === "moved-id" ? [storage.data.manualCardWrite!.cardId] : []);
		await assert.rejects(createManualCardWithRecovery(draft, undefined, DEFAULT_SETTINGS, restarted.vault, restarted.storage, ids), /edited|moved|different Concept/);
		assert.deepEqual([...restarted.vault.files], before);
	}

	for (const malformed of [null, { version: 2 }, { version: 1, draftId: "draft-a", status: "pending" }]) {
		const storage = new Storage({ ...createDefaultPluginData(), manualCardWrite: malformed });
		const vault = new Vault();
		const before = structuredClone(storage.data);
		await assert.rejects(new ManualCardDraftStore(storage).getState(), /invalid/);
		await assert.rejects(write({ ...prose, draftId: "draft-a", updatedAt: "2026-09-06T00:00:00.000Z" }, storage, vault), /invalid/);
		assert.deepEqual(storage.data, before, "normalization must retain invalid recovery metadata");
		assert.equal(vault.files.size, 0);
	}

	{
		const storage = new Storage(createDefaultPluginData());
		const draft = await saveNewDraft(storage);
		const vault = new Vault();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
		await reviews.load();
		let entered!: () => void;
		let release!: () => void;
		const started = new Promise<void>((resolve) => { entered = resolve; });
		const barrier = new Promise<void>((resolve) => { release = resolve; });
		const originalCreate = vault.create.bind(vault);
		vault.create = async (path, content) => { entered(); await barrier; await originalCreate(path, content); };
		const creating = write(draft, storage, vault);
		await started;
		const reviewing = reviews.recordReview("card-review", "good");
		release();
		const [result] = await Promise.all([creating, reviewing]);
		assert.equal(storage.data.reviewStates["card-review"]?.lastRating, "good");
		assert.equal(Object.values(storage.data.reviewEvents).length, 1);
		assert.equal(storage.data.manualCardWrite?.cardId, result.cardId);
		assert.equal(storage.data.manualCardWrite?.status, "written");
		assert.equal(storage.data.manualCardDraft, undefined);
	}
}

export const done = run();
