import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import { createEmptyManualCardDraft } from "../src/models/manualCardDraft";
import { createEmptyManualConceptDraft } from "../src/models/manualConceptDraft";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { ConceptMergeService } from "../src/services/conceptMergeService";
import { addRelatedConceptLink } from "../src/services/conceptRelatedLinks";
import { IncomingConceptMergeService } from "../src/services/incomingConceptMergeService";
import { createManualCardWithRecovery } from "../src/services/manualCardWriteService";
import { createManualConceptWithRecovery } from "../src/services/manualConceptWriteService";
import { renderManualConcept } from "../src/services/manualConceptService";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { assertMergeHasNoPendingWrites } from "../src/services/mergePendingWrites";
import { MemoryGuidedMergeJournal } from "./helpers/memoryGuidedMergeJournal";

const now = "2026-09-19T10:00:00.000Z";
function concept(name: string): ConceptSummary & { cardsPath: string } {
	return { conceptId: `concept-${name}`, title: name, path: `Concepts/${name}.md`, cardsPath: `Cards/${name}.md` };
}
const survivor = concept("survivor");
const merged = concept("merged");
const neighbor = concept("neighbor");
const unrelated = concept("unrelated");
const draft = {
	coreMeaning: "Reviewed Merge content", englishName: "", importance: "normal" as const,
	learningMode: "reviewable" as const, tags: [], title: "Merged title", whyItMatters: "",
};
const incoming: Extract<KnowledgeProposal, { kind: "new_concept" }> = {
	id: "incoming", kind: "new_concept", status: "edited", createdAt: now, updatedAt: now,
	payload: { title: "Incoming", coreMeaning: "Incoming meaning", proposedViews: [], proposedSourceLinks: [], tags: [] },
};

class Storage {
	data: MnemePluginData;
	saves = 0;
	failOnceWhen?: (data: MnemePluginData) => boolean;
	constructor(data = createDefaultPluginData()) { this.data = structuredClone(data); }
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saves += 1;
		if (this.failOnceWhen?.(data)) {
			this.failOnceWhen = undefined;
			throw new Error("Injected completion failure");
		}
		this.data = structuredClone(data);
	}
}

class Vault {
	files: Record<string, string>;
	writes = 0;
	failNextWrite = false;
	constructor(concepts: ConceptSummary[] = [survivor, merged]) {
		this.files = Object.fromEntries(concepts.map((c) => [c.path,
			renderManualConcept({ title: c.title, coreMeaning: `${c.title} meaning` }, c.conceptId, c.cardsPath!, false),
		]));
	}
	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing ${path}`);
		return content;
	}
	async exists(path: string): Promise<boolean> { return this.files[path] !== undefined; }
	async listMarkdownFiles(): Promise<Array<{ path: string }>> { return Object.keys(this.files).map((path) => ({ path })); }
	async createFolder(): Promise<void> {}
	private beforeWrite(): void {
		if (this.failNextWrite) {
			this.failNextWrite = false;
			throw new Error("Injected Markdown failure");
		}
		this.writes += 1;
	}
	async create(path: string, content: string): Promise<void> {
		this.beforeWrite();
		assert.equal(this.files[path], undefined);
		this.files[path] = content;
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		const next = transform(await this.read(path));
		this.beforeWrite();
		this.files[path] = next;
	}
	async modify(path: string, content: string): Promise<void> { await this.process(path, () => content); }
	async append(path: string, content: string): Promise<void> { await this.process(path, (current) => current + content); }
}

function seedIncoming(storage: Storage): void {
	storage.data.knowledgeProposals[incoming.id] = structuredClone(incoming);
	storage.data.conceptConflictMergeDrafts[`inbox:${incoming.id}`] = {
		key: `inbox:${incoming.id}`, existingConceptId: survivor.conceptId,
		incomingFingerprint: "fingerprint", updatedAt: now, draft: { ...draft, coreMeaning: "Preserve authored text" },
	};
}
function prepareIncoming(vault: Vault, storage: Storage, existing: ConceptSummary = survivor) {
	return new IncomingConceptMergeService(vault, storage).prepare({
		draft, existing, origin: { kind: "inbox", proposalId: incoming.id, proposalUpdatedAt: incoming.updatedAt },
	});
}
function snapshot(vault: Vault, storage: Storage) {
	return { files: { ...vault.files }, data: structuredClone(storage.data), writes: vault.writes, saves: storage.saves };
}
function unchanged(vault: Vault, storage: Storage, before: ReturnType<typeof snapshot>) {
	assert.deepEqual(snapshot(vault, storage), before);
}
async function assertBlocked(
	operation: () => Promise<{ status: string; message?: string }>, vault: Vault, storage: Storage, message: RegExp,
) {
	const before = snapshot(vault, storage);
	const result = await operation();
	assert.equal(result.status, "blocked");
	assert.match(result.message ?? "", message);
	unchanged(vault, storage, before);
}

async function run(): Promise<void> {
	// Real Card creation: fail before Markdown or after Markdown at completion save.
	for (const owner of [survivor, merged]) {
		for (const stage of ["before-markdown", "completion"] as const) {
			const vault = new Vault();
			const storage = new Storage();
			const cardDraft = { ...createEmptyManualCardDraft(owner.conceptId, now, "draft-card"), front: "Question?", back: "Answer" };
			storage.data.manualCardDraft = cardDraft;
			storage.data.manualCardDraftId = cardDraft.draftId;
			if (stage === "before-markdown") vault.failNextWrite = true;
			else storage.failOnceWhen = (data) => data.manualCardWrite?.status === "written";
			const write = () => createManualCardWithRecovery(cardDraft, owner, DEFAULT_SETTINGS, vault, storage, new Set(), () => "card-pending");
			await assert.rejects(write(), /Injected/);
			assert.equal(storage.data.manualCardWrite?.status, "pending");
			assert.throws(() => assertMergeHasNoPendingWrites(storage.data, [], [owner.conceptId]), /pending Card creation/);
			assert.throws(() => assertMergeHasNoPendingWrites(storage.data, [owner.cardsPath.replace(/\//g, "\\")]), /pending Card creation/);
			assert.doesNotThrow(() => assertMergeHasNoPendingWrites(storage.data, [unrelated.path], [unrelated.conceptId]));
			seedIncoming(storage);
			assert.equal((await prepareIncoming(vault, storage, owner)).status, "ready", "Incoming Merge does not move this pending Card");
			const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
			await assertBlocked(() => service.prepare({ survivor, merged, preserveMergedAsView: true }), vault, storage, /pending Card creation/);
			const writesBeforeResume = vault.writes;
			await write();
			assert.equal(vault.writes - writesBeforeResume, stage === "completion" ? 0 : 1);
			const plan = await service.prepare({ survivor, merged, preserveMergedAsView: true });
			if (plan.status !== "ready") throw new Error(plan.message);
			const final = plan.plan.writes.find((w) => w.path === survivor.path)!.after;
			assert.deepEqual(await service.execute(plan.plan, final), { status: "merged" });
			const ids = Object.values(vault.files).flatMap((md) => parseMnemeCards(md).flatMap((c) => c.explicitCardId ? [c.explicitCardId] : []));
			assert.deepEqual(ids, ["card-pending"]);
		}
	}

	// A Concept can be scanned from Markdown while its creation is still pending.
	{
		const vault = new Vault();
		const storage = new Storage();
		seedIncoming(storage);
		const conceptDraft = { ...createEmptyManualConceptDraft(undefined, now, "draft-concept"), title: "New", coreMeaning: "New meaning" };
		storage.data.manualConceptDraft = conceptDraft;
		storage.data.manualConceptDraftId = conceptDraft.draftId;
		storage.failOnceWhen = (data) => data.manualConceptWrite?.status === "written";
		const write = () => createManualConceptWithRecovery(conceptDraft, DEFAULT_SETTINGS, vault, storage, { createId: () => "concept-new" });
		await assert.rejects(write(), /Injected completion/);
		const receipt = storage.data.manualConceptWrite!;
		const created = { conceptId: receipt.conceptId, path: receipt.path, cardsPath: receipt.cardsPath, title: "New" };
		const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
		await assertBlocked(() => service.prepare({ survivor, merged: created, preserveMergedAsView: true }), vault, storage, /pending Concept creation/);
		await assertBlocked(() => prepareIncoming(vault, storage, created), vault, storage, /pending Concept creation/);
		const beforeResume = { ...vault.files };
		const writesBeforeResume = vault.writes;
		await write();
		assert.equal(vault.writes, writesBeforeResume);
		assert.deepEqual(vault.files, beforeResume);
		assert.equal((await service.prepare({ survivor, merged: created, preserveMergedAsView: true })).status, "ready");
		assert.equal((await prepareIncoming(vault, storage, created)).status, "ready");
	}

	// A pending Inbox update on a survivor or rewired neighbor must retain its hash.
	for (const target of [survivor, neighbor, unrelated]) {
		const vault = new Vault([survivor, merged, neighbor, unrelated]);
		vault.files[neighbor.path] = addRelatedConceptLink(await vault.read(neighbor.path), merged).markdown;
		const storage = new Storage();
		seedIncoming(storage);
		const proposal: KnowledgeProposal = {
			id: "pending-update", kind: "update_concept", status: "approved", createdAt: now, updatedAt: now,
			payload: { conceptId: target.conceptId, proposedCoreMeaning: "Approved new meaning" },
		};
		storage.data.knowledgeProposals[proposal.id] = proposal;
		storage.failOnceWhen = (data) => data.knowledgeProposals[proposal.id]?.status === "written";
		const writer = new ApprovedProposalWriter({
			storage, vaultAdapter: vault, settingsProvider: () => DEFAULT_SETTINGS,
			conceptScanner: { scanConcepts: async () => [survivor, merged, neighbor, unrelated] },
		});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.ok(storage.data.knowledgeProposals[proposal.id]?.writeReceipt);
		const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
		if (target !== unrelated) {
			await assertBlocked(() => service.prepare({ survivor, merged, preserveMergedAsView: true }), vault, storage, /Complete Inbox write pending-update/);
		} else {
			assert.equal((await service.prepare({ survivor, merged, preserveMergedAsView: true })).status, "ready");
		}
		if (target === survivor) {
			await assertBlocked(() => prepareIncoming(vault, storage), vault, storage, /Complete Inbox write pending-update/);
		}
		const writesBeforeResume = vault.writes;
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "written");
		assert.equal(vault.writes, writesBeforeResume);
		assert.equal((await service.prepare({ survivor, merged, preserveMergedAsView: true })).status, "ready");
	}

	// A receipt appearing after preview remains protected by the existing state check.
	{
		const vault = new Vault();
		const storage = new Storage();
		const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ survivor, merged, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const cardDraft = { ...createEmptyManualCardDraft(merged.conceptId, now, "later-card"), front: "Later?", back: "Yes" };
		storage.data.manualCardDraft = cardDraft;
		storage.data.manualCardDraftId = cardDraft.draftId;
		vault.failNextWrite = true;
		await assert.rejects(createManualCardWithRecovery(cardDraft, merged, DEFAULT_SETTINGS, vault, storage), /Injected/);
		const before = snapshot(vault, storage);
		const final = prepared.plan.writes.find((w) => w.path === survivor.path)!.after;
		assert.equal((await service.execute(prepared.plan, final)).status, "conflict");
		unchanged(vault, storage, before);
	}

	for (const field of ["manualCardWrite", "manualConceptWrite"] as const) {
		const data = createDefaultPluginData();
		Object.assign(data, { [field]: null });
		assert.throws(() => assertMergeHasNoPendingWrites(data, [survivor.path]), /invalid/);
	}
}

export const done = run();
