import assert from "node:assert/strict";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import type { MnemePluginData } from "../src/models/reviewState";
import { RecoverableCardDeletion } from "../src/services/recoverableCardDeletion";
import { deleteCardBlock } from "../src/services/cardDeletionEditor";

const path = "Mneme/Cards/First Cards.md";
const block = "<!-- MNEME:CARD:start id=\"card-first\" type=\"definition\" -->\n<!-- MNEME:FRONT:start -->\nWhat is First?\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nFirst.\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n";
const content = `---\nmneme_type: card_group\nmneme_concept_id: concept-first\n---\n${block}`;
const after = (() => {
	const result = deleteCardBlock(content, { cardId: "card-first", expectedFront: "What is First?", expectedBack: "First." });
	if (result.status !== "deleted") throw new Error(result.message);
	return result.markdown;
})();
const input = { cardId: "card-first", path, content, front: "What is First?", back: "First." };

class Storage {
	data: MnemePluginData = createDefaultPluginData();
	private saves = 0;
	constructor(private readonly fail?: { at: number; after?: boolean }) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saves += 1;
		if (this.fail?.at === this.saves && !this.fail.after) throw new Error(`save-${this.saves}-before`);
		this.data = structuredClone(data);
		if (this.fail?.at === this.saves && this.fail.after) throw new Error(`save-${this.saves}-after`);
	}
}

class Vault {
	files = new Map([[path, content]]);
	processCalls = 0;
	readCalls = 0;
	failProcess?: "before" | "after";
	editInProcess?: string;
	async readFresh(filePath: string): Promise<string> {
		this.readCalls += 1;
		const value = this.files.get(filePath);
		if (value === undefined) throw new Error(`Missing ${filePath}`);
		return value;
	}
	async process(filePath: string, transform: (current: string) => string): Promise<void> {
		this.processCalls += 1;
		if (this.failProcess === "before") throw new Error("process-before");
		if (this.editInProcess !== undefined) this.files.set(filePath, this.editInProcess);
		const current = await this.readFresh(filePath);
		this.files.set(filePath, transform(current));
		if (this.failProcess === "after") throw new Error("process-after");
	}
}

async function rejects(action: Promise<unknown>, pattern: RegExp): Promise<void> { await assert.rejects(action, pattern); }

async function assertDeleted(storage: Storage, vault: Vault): Promise<void> {
	assert.equal(await vault.readFresh(path), after);
	assert.equal(storage.data.cardDeletion, undefined);
	assert.ok(storage.data.cardTombstones["card-first"]);
	assert.equal(storage.data.reviewStates["card-first"], undefined);
}

async function run(): Promise<void> {
	{
		const storage = new Storage(); const vault = new Vault();
		const legacy = { ...input, cardId: "constructor", content: content.replace("card-first", "constructor") };
		vault.files.set(path, legacy.content);
		await new RecoverableCardDeletion(vault, storage).delete(legacy);
		assert.equal(vault.processCalls, 1, "prototype properties are not completed deletions");
		assert.equal(storage.data.cardTombstones.constructor.cardId, "constructor");
	}

	await new RecoverableCardDeletion(new Vault(), new Storage(), () => "2026-09-08T00:00:00.000Z").delete(input);

	for (const fail of [{ at: 1 }, { at: 1, after: true }, { at: 2 }, { at: 2, after: true }]) {
		const storage = new Storage(fail); const vault = new Vault();
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /save-\d/);
		const resumed = await new RecoverableCardDeletion(vault, storage, () => "2026-09-08T00:00:00.000Z").resume();
		const shouldResume = fail.at === 1 && !!fail.after || fail.at === 2 && !fail.after;
		assert.equal(resumed, shouldResume);
		if (shouldResume || fail.at === 2 && fail.after) await assertDeleted(storage, vault);
		else assert.equal(await vault.readFresh(path), content);
	}

	for (const failure of ["before", "after"] as const) {
		const storage = new Storage(); const vault = new Vault(); vault.failProcess = failure;
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /process-/);
		vault.failProcess = undefined;
		assert.equal(await new RecoverableCardDeletion(vault, storage).resume(), true);
		await assertDeleted(storage, vault);
	}

	{
		const storage = new Storage(); const vault = new Vault();
		vault.editInProcess = `${content}\nUser edit\n`;
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /changed/);
		assert.equal(await vault.readFresh(path), `${content}\nUser edit\n`);
	}
	{
		const storage = new Storage(); const vault = new Vault();
		await rejects(new RecoverableCardDeletion(vault, storage).delete({ ...input, content: `${content}\nTarget rubric changed\n` }), /changed/);
		assert.equal(storage.data.cardDeletion, undefined);
	}
	{
		const storage = new Storage(); const vault = new Vault();
		// Establish a valid pending journal, then edit the target before Resume.
		vault.failProcess = "after";
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /process/);
		vault.failProcess = undefined; vault.files.set(path, `${after}\nEdited before resume\n`);
		await rejects(new RecoverableCardDeletion(vault, storage).resume(), /changed/);
	}
	{
		const storage = new Storage(); const vault = new Vault();
		const service = new RecoverableCardDeletion(vault, storage);
		const results = await Promise.allSettled([service.delete(input), service.delete(input)]);
		assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"]);
		assert.equal(vault.processCalls, 1, "duplicate deletion must not perform repeated Markdown writes");
		await assertDeleted(storage, vault);
		assert.equal(storage.data.reviewEvents["event-other"], undefined);
	}
	{
		const storage = new Storage({ at: 1, after: true }); const vault = new Vault();
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /save-1/);
		const journal = storage.data.cardDeletion as Record<string, unknown>;
		storage.data.cardDeletion = { ...journal, path: "../outside.md" };
		vault.readCalls = 0;
		await rejects(new RecoverableCardDeletion(vault, storage).resume(), /invalid|path|changed/);
		assert.equal(vault.readCalls, 0, "malformed journal must fail before Vault I/O");
	}
	{
		const storage = new Storage(); const vault = new Vault();
		storage.data.reviewStates["card-other"] = { cardId: "card-other", createdAt: "2026-01-01T00:00:00.000Z", lapseCount: 0, reviewCount: 1, updatedAt: "2026-01-01T00:00:00.000Z" };
		storage.data.settings = { ...storage.data.settings, fsrsEnabled: false };
		storage.data.reviewEvents["event-keep"] = { cardId: "card-other", eventId: "event-keep", rating: "good", reviewedAt: "2026-01-01T00:00:00.000Z" };
		await new RecoverableCardDeletion(vault, storage).delete(input);
		assert.ok(storage.data.reviewStates["card-other"]);
		assert.ok(storage.data.reviewEvents["event-keep"]);
		assert.equal(storage.data.settings.fsrsEnabled, false);
	}

	// A rating queued behind deletion cannot revive the deleted Card; unrelated work survives.
	{
		const storage = new Storage(); const vault = new Vault();
		let entered!: () => void; let release!: () => void;
		const started = new Promise<void>((resolve) => { entered = resolve; });
		const barrier = new Promise<void>((resolve) => { release = resolve; });
		const process = vault.process.bind(vault);
		vault.process = async (filePath, transform) => { entered(); await barrier; await process(filePath, transform); };
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
		await reviews.load();
		const deleting = new RecoverableCardDeletion(vault, storage).delete(input);
		await started;
		const rating = assert.rejects(reviews.recordReview(input.cardId, "good"), /Deleted Card IDs/);
		const other = reviews.recordReview("other-card", "good");
		const settings = runPluginDataMutation(storage, async () => {
			const latest = await storage.loadData() as MnemePluginData;
			await storage.saveData({ ...latest, settings: { ...latest.settings, fsrsEnabled: false } });
		});
		release();
		await Promise.all([deleting, rating, other, settings]);
		assert.equal(Object.values(storage.data.reviewEvents).length, 1);
		assert.equal(Object.values(storage.data.reviewEvents)[0]?.cardId, "other-card");
		assert.equal(storage.data.settings.fsrsEnabled, false);
	}
	for (const pending of [true, false]) {
		const storage = new Storage(pending ? { at: 1, after: true } : undefined);
		const vault = new Vault();
		const deletion = new RecoverableCardDeletion(vault, storage).delete(input);
		if (pending) await rejects(deletion, /save/); else await deletion;
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		const before = structuredClone(storage.data);
		await rejects(reviews.recordReview(input.cardId, "good"), /deletion is pending|Deleted Card IDs/);
		await rejects(reviews.suspendCard(input.cardId), /deletion is pending|Deleted Card IDs/);
		await rejects(reviews.retireCard(input.cardId), /deletion is pending|Deleted Card IDs/);
		await rejects(reviews.deferReviewUntil(input.cardId, new Date(Date.now() + 86400000)), /deletion is pending|Deleted Card IDs/);
		await rejects(reviews.rekeyCard(input.cardId, "new-id"), /deletion is pending|Deleted Card IDs/);
		assert.deepEqual(storage.data, before);
	}
	// A later cache reload failure is not part of the persisted deletion result.
	{
		const storage = new Storage(); const vault = new Vault();
		const load = storage.loadData.bind(storage);
		storage.loadData = async () => {
			if (storage.data.cardTombstones[input.cardId]) throw new Error("cache refresh failed");
			return load();
		};
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.deleteCardFromMarkdown(input, vault);
		await assertDeleted(storage, vault);
		await rejects(reviews.load(), /cache refresh failed/);
	}
	// Completion keeps the deleted Card's history/counts and all editable drafts/proposals.
	{
		const storage = new Storage(); const vault = new Vault();
		const at = "2026-09-08T00:00:00.000Z";
		storage.data.reviewStates[input.cardId] = { cardId: input.cardId, createdAt: at, updatedAt: at, reviewCount: 7, lapseCount: 2 };
		storage.data.reviewEvents["old-event"] = { cardId: input.cardId, eventId: "old-event", rating: "again", reviewedAt: at };
		storage.data.manualCardDraftId = "draft-keep";
		storage.data.manualCardDraft = { draftId: "draft-keep", cardType: "definition", conceptId: "concept-first", front: "Draft front", back: "Draft back", rubric: "", updatedAt: at };
		storage.data.knowledgeProposals["proposal-keep"] = { id: "proposal-keep", kind: "new_card", status: "suggested", createdAt: at, updatedAt: at,
			payload: { conceptId: "concept-first", card: { cardType: "definition", front: "Proposal front", back: "Proposal back" } } };
		const before = structuredClone(storage.data);
		await new RecoverableCardDeletion(vault, storage).delete(input);
		assert.equal(storage.data.cardTombstones[input.cardId]?.reviewCount, 7);
		assert.equal(storage.data.cardTombstones[input.cardId]?.lapseCount, 2);
		assert.deepEqual(storage.data.reviewEvents, before.reviewEvents);
		assert.deepEqual(storage.data.manualCardDraft, before.manualCardDraft);
		assert.deepEqual(storage.data.knowledgeProposals, before.knowledgeProposals);
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.eraseDeletedCardHistory(input.cardId);
		assert.equal(storage.data.cardTombstones[input.cardId], undefined);
		assert.deepEqual(storage.data.reviewEvents, {});
		assert.equal(storage.data.cardDeletion, undefined);
		await rejects(new RecoverableCardDeletion(vault, storage).delete(input), /changed/);
		assert.equal(storage.data.cardTombstones[input.cardId], undefined, "a stale delete view cannot recreate an erased tombstone");
	}
	console.log("Recoverable Card deletion tests passed.");
}

export const done = run();
