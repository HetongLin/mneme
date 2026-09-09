import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { createDefaultPluginData, normalizePluginData } from "../src/services/reviewStateStore";
import { RecoverableCardIdRepair, type CardIdRepairInput } from "../src/services/recoverableCardIdRepair";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { ReviewStateStore } from "../src/services/reviewStateStore";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";

const path = "Mneme/Cards/Repair.md";
const card = (id?: string, front = "Question", back = "Answer") => `${id ? `<!-- MNEME:CARD:start id="${id}" type="definition" -->` : ""}\n<!-- MNEME:FRONT:start -->\n${front}\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\n${back}\n<!-- MNEME:BACK:end -->\n${id ? "<!-- MNEME:CARD:end -->" : ""}`;
const group = (body: string) => `---\nmneme_type: card_group\nmneme_concept_id: concept-repair\n---\n${body}\n`;
const explicit = group(`${card("old-card", "Question", "Answer")}\n${card("old-card", "Other", "Other answer")}`);
const duplicate = explicit;
const legacy = group(card(undefined));

class Storage {
	data: MnemePluginData;
	private saves = 0;
	constructor(data = createDefaultPluginData(), private fail?: { at: number; after?: boolean }) { this.data = normalizePluginData(data); }
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saves += 1;
		if (this.fail?.at === this.saves && !this.fail.after) throw new Error(`save-${this.saves}-before`);
		this.data = structuredClone(data);
		if (this.fail?.at === this.saves && this.fail.after) throw new Error(`save-${this.saves}-after`);
	}
}

class Vault {
	files = new Map<string, string>(); processCalls = 0; readCalls = 0;
	failProcess?: "before" | "after"; editInProcess?: string; entered?: () => void; barrier?: Promise<void>;
	constructor(content = explicit) { this.files.set(path, content); }
	async readFresh(filePath: string): Promise<string> { this.readCalls += 1; const value = this.files.get(filePath); if (value === undefined) throw new Error(`Missing ${filePath}`); return value; }
	parseFrontmatter(markdown: string): unknown {
		const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/); const result: Record<string, string> = {};
		for (const line of (match?.[1] ?? "").split(/\r?\n/)) { const pair = line.match(/^([^:#]+):\s*(.*)$/); if (pair) result[pair[1]!.trim()] = pair[2]!.trim(); }
		return result;
	}
	async listMarkdownFiles(): Promise<Array<{ path: string }>> { return [...this.files.keys()].filter((p) => p.endsWith(".md")).map((p) => ({ path: p })); }
	async process(filePath: string, transform: (current: string) => string): Promise<void> {
		this.processCalls += 1; if (this.failProcess === "before") throw new Error("process-before");
		this.entered?.(); if (this.barrier) await this.barrier;
		if (this.editInProcess !== undefined) this.files.set(filePath, this.editInProcess);
		const current = await this.readFresh(filePath); this.files.set(filePath, transform(current));
		if (this.failProcess === "after") throw new Error("process-after");
	}
}

const input = (content: string, cardId: string, cardIndex = 0, hasExplicitCardId = true): CardIdRepairInput => ({
	cardId, path, content, cardIndex, hasExplicitCardId, front: cardIndex ? "Other" : "Question", back: cardIndex ? "Other answer" : "Answer",
});
async function reject(p: Promise<unknown>, re: RegExp) { await assert.rejects(p, re); }

async function run(): Promise<void> {
	// Each save failure has a recoverable, exactly-once outcome.
	for (const fail of [{ at: 1 }, { at: 1, after: true }, { at: 2 }, { at: 2, after: true }]) {
		const storage = new Storage(undefined, fail); const vault = new Vault();
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "new-card-001"), /save-/);
		const resumed = await new RecoverableCardIdRepair(vault, storage).resume();
		const shouldResume = (fail.at === 1 && !!fail.after) || (fail.at === 2 && !fail.after);
		assert.equal(resumed, shouldResume);
		assert.equal(vault.processCalls, fail.at === 1 ? (fail.after ? 1 : 0) : 1);
		if (shouldResume || (fail.at === 2 && !!fail.after)) assert.match(await vault.readFresh(path), /id="new-card-001"/);
		else assert.equal(await vault.readFresh(path), explicit);
	}
	// The same journal matrix exercises legacy state migration across a real restart.
	for (const fail of [{ at: 1 }, { at: 1, after: true }, { at: 2 }, { at: 2, after: true }]) {
		const seed = createDefaultPluginData(); const stamp = "2026-01-01T00:00:00.000Z";
		seed.reviewStates[`${path}#0`] = { cardId: `${path}#0`, createdAt: stamp, updatedAt: stamp, reviewCount: 4, lapseCount: 2 };
		seed.reviewEvents.old = { cardId: `${path}#0`, eventId: "old", rating: "good", reviewedAt: stamp };
		seed.reviewDeferrals[`${path}#0`] = { cardId: `${path}#0`, deferredAt: stamp, resumeAt: "2026-01-02T00:00:00.000Z" };
		seed.suspendedCards[`${path}#0`] = { cardId: `${path}#0`, suspendedAt: stamp };
		seed.retiredCards[`${path}#0`] = { cardId: `${path}#0`, retiredAt: stamp };
		const storage = new Storage(seed, fail); const vault = new Vault(legacy);
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(legacy, `${path}#0`, 0, false), "legacy-matrix"), /save-/);
		const restartedStorage = new Storage(structuredClone(storage.data)); const restartedVault = new Vault(vault.files.get(path));
		const resumed = await new RecoverableCardIdRepair(restartedVault, restartedStorage).resume();
		const complete = fail.at === 1 && !!fail.after || fail.at === 2;
		assert.equal(resumed, fail.at === 1 && !!fail.after || fail.at === 2 && !fail.after);
		if (complete) {
			assert.equal(restartedStorage.data.reviewStates[`${path}#0`], undefined);
			assert.equal(restartedStorage.data.reviewStates["legacy-matrix"]?.reviewCount, 4);
			assert.equal(restartedStorage.data.reviewEvents.old?.cardId, "legacy-matrix");
			for (const key of ["reviewDeferrals", "suspendedCards", "retiredCards"] as const) {
				assert.equal(restartedStorage.data[key][`${path}#0`], undefined);
				assert.deepEqual(restartedStorage.data[key]["legacy-matrix"], { ...seed[key][`${path}#0`], cardId: "legacy-matrix" });
			}
			assert.equal(restartedVault.processCalls, fail.at === 1 ? 1 : 0);
			assert.equal(await new RecoverableCardIdRepair(restartedVault, restartedStorage).resume(), false);
		} else assert.ok(restartedStorage.data.reviewStates[`${path}#0`]);
	}

	for (const failure of ["before", "after"] as const) {
		const storage = new Storage(); const vault = new Vault(); vault.failProcess = failure;
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "new-card-002"), /process-/);
		vault.failProcess = undefined;
		assert.equal(await new RecoverableCardIdRepair(vault, storage).resume(), true);
		assert.equal(vault.processCalls, failure === "before" ? 2 : 1, "process is retried only when the write did not happen");
		assert.match(await vault.readFresh(path), /id="new-card-002"/);
	}

	// Restarting service with the same persisted storage completes pending work once.
	{
		const storage = new Storage(undefined, { at: 2 }); const vault = new Vault();
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "restart-card"), /save-2/);
		const restartedVault = new Vault(vault.files.get(path));
		assert.equal(await new RecoverableCardIdRepair(restartedVault, storage).resume(), true);
		assert.equal(await new RecoverableCardIdRepair(restartedVault, storage).resume(), false);
		assert.equal(restartedVault.processCalls, 0, "already-written Markdown is not written again");
		assert.equal(storage.data.cardIdRepairs?.["restart-card"]?.status, "completed");
	}

	// Missing/invalid receipts are rejected before any Vault I/O.
	{
		const storage = new Storage(undefined, { at: 1, after: true }); const vault = new Vault();
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "malformed-card"), /save-1/);
		storage.data.cardIdRepairs = { "malformed-card": { ...storage.data.cardIdRepairs!["malformed-card"], path: "../outside.md" } };
		vault.readCalls = 0; await reject(new RecoverableCardIdRepair(vault, storage).resume(), /invalid|path/); assert.equal(vault.readCalls, 0);
	}

	// A stale full snapshot, edits during process, and user edits before Resume preserve Markdown.
	{
		const storage = new Storage(); const vault = new Vault();
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(`${explicit}\nchanged`, "old-card"), "stale-card"), /changed/); assert.equal(storage.data.cardIdRepairs, undefined);
		vault.failProcess = "after"; await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "edit-card"), /process-/);
		vault.failProcess = undefined; vault.files.set(path, `${explicit}\nuser edit`); await reject(new RecoverableCardIdRepair(vault, storage).resume(), /changed/); assert.match(await vault.readFresh(path), /user edit/);
		const vault2 = new Vault(); vault2.editInProcess = `${explicit}\nuser edit`; await reject(new RecoverableCardIdRepair(vault2, new Storage()).repair(input(explicit, "old-card"), "process-edit"), /changed/); assert.match(await vault2.readFresh(path), /user edit/);
	}

	// Explicit duplicate repair retains old state; destination collisions and history-only collisions block migration.
	{
		const data = createDefaultPluginData(); const at = "2026-01-01T00:00:00.000Z";
		data.reviewStates["old-card"] = { cardId: "old-card", createdAt: at, updatedAt: at, reviewCount: 3, lapseCount: 1 };
		data.reviewEvents.keep = { cardId: "old-card", eventId: "keep", rating: "good", reviewedAt: at };
		data.reviewDeferrals["old-card"] = { cardId: "old-card", deferredAt: at, resumeAt: "2026-01-02T00:00:00.000Z" };
		data.suspendedCards["old-card"] = { cardId: "old-card", suspendedAt: at };
		data.retiredCards["old-card"] = { cardId: "old-card", retiredAt: at };
		data.settings.fsrsEnabled = false; data.manualCardDraftId = "draft"; data.manualCardDraft = { draftId: "draft", cardType: "definition", conceptId: "concept-repair", front: "draft", back: "draft", rubric: "", updatedAt: at };
		const storage = new Storage(data); const vault = new Vault(duplicate); await new RecoverableCardIdRepair(vault, storage).repair(input(duplicate, "old-card"), "explicit-new");
		assert.ok(storage.data.reviewStates["old-card"]); assert.equal(storage.data.reviewStates["explicit-new"], undefined); assert.equal(storage.data.reviewEvents.keep?.cardId, "old-card"); assert.equal(storage.data.settings.fsrsEnabled, false); assert.equal(storage.data.manualCardDraftId, "draft");
		assert.ok(storage.data.reviewDeferrals["old-card"]); assert.ok(storage.data.suspendedCards["old-card"]); assert.ok(storage.data.retiredCards["old-card"]);
		assert.equal(await new RecoverableCardIdRepair(vault, storage).repair(input(duplicate, "old-card"), "explicit-new"), undefined); assert.equal(vault.processCalls, 1);
		vault.files.set(path, duplicate); const calls = vault.processCalls;
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(duplicate, "old-card"), "explicit-new"), /changed/);
		assert.equal(vault.processCalls, calls); assert.equal(storage.data.cardIdRepairs?.["explicit-new"]?.status, "completed");
	}
	{
		const collision = new Storage(); collision.data.reviewStates["new-collision"] = { cardId: "new-collision", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", reviewCount: 1, lapseCount: 0 };
		await reject(new RecoverableCardIdRepair(new Vault(explicit), collision).repair(input(explicit, "old-card"), "new-collision"), /already has review state|used/);
		const history = new Storage(); history.data.reviewEvents.e = { cardId: "history-only", eventId: "e", rating: "good", reviewedAt: "2026-01-01T00:00:00.000Z" };
		await reject(new RecoverableCardIdRepair(new Vault(explicit), history).repair(input(explicit, "old-card"), "history-only"), /already has review state|history/);
		const freshVault = new Vault(explicit); freshVault.files.set("Mneme/Cards/Other.md", group(card("fresh-collision", "Else", "Else answer")).replace(/\n/g, "\r\n"));
		const freshStorage = new Storage(); await reject(new RecoverableCardIdRepair(freshVault, freshStorage).repair(input(explicit, "old-card"), "fresh-collision"), /already exists/);
		assert.equal(freshVault.processCalls, 0); assert.equal(freshStorage.data.cardIdRepairs, undefined);
	}

	// Legacy IDs migrate state; old identities cannot receive further reviews.
	{
		const storage = new Storage(); const vault = new Vault(legacy); const d = createDefaultPluginData(); d.reviewStates[`${path}#0`] = { cardId: `${path}#0`, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", reviewCount: 2, lapseCount: 0 }; storage.data = d;
		await new RecoverableCardIdRepair(vault, storage).repair(input(legacy, `${path}#0`, 0, false), "legacy-new");
		assert.equal(storage.data.reviewStates[`${path}#0`], undefined); assert.equal(storage.data.reviewStates["legacy-new"]?.cardId, "legacy-new");
		assert.equal(await new RecoverableCardIdRepair(vault, storage).resume(), false);
		assert.equal(vault.processCalls, 1);
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false })); await reviews.load();
		await reject(reviews.recordReview(`${path}#0`, "good"), /Card identity changed|repair/);
		await reviews.recordReview("legacy-new", "good"); assert.equal(storage.data.reviewEvents[Object.keys(storage.data.reviewEvents)[0]!].cardId, "legacy-new");
	}
	// A pending repair blocks mutations to both identities before completion.
	{
		const storage = new Storage(undefined, { at: 1, after: true }); const vault = new Vault();
		await reject(new RecoverableCardIdRepair(vault, storage).repair(input(explicit, "old-card"), "queued-new"), /save-1/);
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false })); await reviews.load();
		for (const id of ["old-card", "queued-new"]) {
			for (const action of [() => reviews.recordReview(id, "good"), () => reviews.suspendCard(id),
				() => reviews.retireCard(id), () => reviews.resumeCard(id), () => reviews.restoreRetiredCard(id),
				() => reviews.deferReviewUntil(id, new Date(Date.now() + 86400000)), () => reviews.eraseDeletedCardHistory(id),
				() => reviews.deleteCard(id), () => reviews.rekeyCard(id, "other-id")]) {
				await reject(action(), /repair|identity/);
			}
		}
	}
	// Concurrent queued work observes the completed migration in queue order.
	{
		const storage = new Storage(); const vault = new Vault(legacy); let enter!: () => void; let release!: () => void;
		const entered = new Promise<void>((resolve) => { enter = resolve; }); const barrier = new Promise<void>((resolve) => { release = resolve; });
		vault.entered = enter; vault.barrier = barrier;
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false })); await reviews.load();
		const repair = new RecoverableCardIdRepair(vault, storage).repair(input(legacy, `${path}#0`, 0, false), "queued-interleave"); await entered;
		const oldRating = reviews.recordReview(`${path}#0`, "good"); const unrelated = reviews.recordReview("unrelated-card", "good");
		const settings = runPluginDataMutation(storage, async () => { const latest = await storage.loadData(); await storage.saveData({ ...(latest as MnemePluginData), settings: { ...storage.data.settings, fsrsEnabled: false } }); });
		release(); await repair; await reject(oldRating, /repair|identity/); await Promise.all([unrelated, settings]);
		assert.equal(storage.data.settings.fsrsEnabled, false); assert.ok(Object.values(storage.data.reviewEvents).some((event) => event.cardId === "unrelated-card"));
	}
	console.log("Recoverable Card ID repair tests passed.");
}

export const done = run();
