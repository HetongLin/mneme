import assert from "node:assert/strict";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import type { PluginDataStorage } from "../src/services/pluginDataMutation";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { MnemePluginData } from "../src/models/reviewState";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import { normalizePluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import {
	createPluginData,
	createProposal,
	createSourceRecord,
} from "./knowledgeProposalTestUtils";

class RecoveryStorage implements PluginDataStorage {
	data: MnemePluginData;
	savedData?: MnemePluginData;
	saveCount = 0;
	failSaveOnceWhen?: (data: MnemePluginData) => boolean;
	saveThenThrowOnceWhen?: (data: MnemePluginData) => boolean;
	private failed = false;

	constructor(data: unknown) {
		this.data = normalizePluginData(structuredClone(data));
	}

	async loadData(): Promise<unknown> {
		return structuredClone(this.data);
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.saveCount += 1;
		if (!this.failed && this.failSaveOnceWhen?.(data)) {
			this.failed = true;
			throw new Error("Injected metadata save failure");
		}
		this.savedData = structuredClone(data);
		this.data = structuredClone(data);
		if (this.saveThenThrowOnceWhen?.(data)) {
			this.saveThenThrowOnceWhen = undefined;
			throw new Error("Injected after-save failure");
		}
	}
}

class RecoveryVault implements MnemeVaultAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	createCount = 0;
	processCount = 0;
	modifyCount = 0;
	failCreateOnce = false;
	failProcessOnce = false;
	failModifyOnce = false;
	throwAfterCreate = false;
	throwAfterProcess = false;
	throwAfterModify = false;
	beforeNextProcess?: () => void;
	private writeBarrier?: { promise: Promise<void>; release: () => void };
	private writeStarted?: () => void;

	constructor(initial: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initial)) this.files.set(path, content);
	}

	async exists(path: string): Promise<boolean> { return this.files.has(path) || this.folders.has(path); }
	armWriteBarrier(): () => void {
		let release!: () => void;
		const promise = new Promise<void>((resolve) => { release = resolve; });
		this.writeBarrier = { promise, release };
		return release;
	}
	waitForWriteStart(): Promise<void> {
		return new Promise((resolve) => { this.writeStarted = resolve; });
	}
	private async waitForWriteBarrier(): Promise<void> {
		const barrier = this.writeBarrier;
		if (!barrier) return;
		this.writeStarted?.();
		this.writeStarted = undefined;
		this.writeBarrier = undefined;
		await barrier.promise;
	}
	async createFolder(path: string): Promise<void> { this.folders.add(path); }
	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}
	async append(path: string, content: string): Promise<void> { this.files.set(path, `${this.files.get(path) ?? ""}${content}`); }
	async create(path: string, content: string): Promise<void> {
		await this.waitForWriteBarrier();
		this.createCount += 1;
		if (this.failCreateOnce) { this.failCreateOnce = false; throw new Error("Injected create failure"); }
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		this.files.set(path, content);
		if (this.throwAfterCreate) { this.throwAfterCreate = false; throw new Error("Injected after-create failure"); }
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.beforeNextProcess?.();
		this.beforeNextProcess = undefined;
		await this.waitForWriteBarrier();
		this.processCount += 1;
		if (this.failProcessOnce) { this.failProcessOnce = false; throw new Error("Injected process failure"); }
		const current = await this.read(path);
		this.files.set(path, transform(current));
		if (this.throwAfterProcess) { this.throwAfterProcess = false; throw new Error("Injected after-process failure"); }
	}
	async modify(path: string, content: string): Promise<void> {
		this.modifyCount += 1;
		if (this.failModifyOnce) { this.failModifyOnce = false; throw new Error("Injected modify failure"); }
		if (!this.files.has(path)) throw new Error(`Missing file: ${path}`);
		this.files.set(path, content);
		if (this.throwAfterModify) { this.throwAfterModify = false; throw new Error("Injected after-modify failure"); }
	}
}

const concept = {
	conceptId: "concept-encapsulation",
	path: "Mneme/Concepts/Encapsulation/Concept.md",
	title: "Encapsulation",
};

function conceptProposal(id: string, overrides: Record<string, unknown> = {}) {
	const proposal = createProposal(id, {
		kind: "new_concept",
		payload: { coreMeaning: "Hides representation.", title: "Encapsulation" },
		status: "approved",
	});
	return { ...proposal, ...overrides } as KnowledgeProposal;
}

function cardProposal(id: string) {
	return createProposal(id, {
		kind: "new_card",
		payload: {
			card: { back: "Hides representation.", cardType: "definition", front: "What is encapsulation?" },
			conceptId: concept.conceptId,
			conceptTitle: concept.title,
		},
		status: "approved",
	});
}

function linkProposal(id: string): KnowledgeProposal {
	return { ...createProposal(id), kind: "link_existing_concept", status: "approved", payload: {
		targetConceptId: concept.conceptId,
		proposedSourceLink: { relationType: "supporting", sourcePath: "Notes/Intro.md" },
	} } as KnowledgeProposal;
}

function viewProposal(id: string): KnowledgeProposal {
	return { ...createProposal(id), kind: "add_view", status: "approved", payload: {
		conceptId: concept.conceptId, view: { body: "A view.", title: "View" },
	} } as KnowledgeProposal;
}

function updateProposal(id: string): KnowledgeProposal {
	return { ...createProposal(id), kind: "update_concept", status: "approved", payload: {
		conceptId: concept.conceptId, proposedCoreMeaning: "Updated meaning.",
	} } as KnowledgeProposal;
}

function makeWriter(storage: RecoveryStorage, vault: RecoveryVault, proposalIds: Record<string, unknown>) {
	const options = {
		storage,
		conceptScanner: { scanConcepts: async () => [concept] },
		cardIdFactory: (() => { let n = 0; return () => `card-recovery-${++n}`; })(),
		conceptIdFactory: (() => { let n = 0; return () => `concept-recovery-${++n}`; })(),
		isCardIdReserved: async () => false,
		isConceptIdReserved: async () => false,
		now: () => "2026-01-02T12:00:00.000Z",
		settingsProvider: () => DEFAULT_SETTINGS,
		vaultAdapter: vault,
	};
	return { writer: new ApprovedProposalWriter(options), options, proposalIds };
}

function receiptOf(storage: RecoveryStorage, proposalId: string): Record<string, unknown> | undefined {
	const proposal = storage.data.knowledgeProposals[proposalId] as unknown as { writeReceipt?: Record<string, unknown> };
	return proposal?.writeReceipt;
}

async function run(): Promise<void> {
	{
		const proposal = cardProposal("pending-card-deletion");
		const storage = new RecoveryStorage({ knowledgeProposals: { [proposal.id]: proposal } });
		storage.data.cardDeletion = { version: 1, cardId: "card-deleting", path: "Mneme/Cards/Encapsulation/Cards.md",
			beforeHash: "a".repeat(64), afterHash: "b".repeat(64), createdAt: "2026-09-08T00:00:00.000Z" };
		const vault = new RecoveryVault();
		const { writer } = makeWriter(storage, vault, {});
		const result = await writer.writeApprovedProposal(proposal.id);
		assert.equal(result.status, "failed");
		assert.match(result.message, /deletion is pending/);
		assert.equal(vault.createCount + vault.modifyCount + vault.processCount, 0);
		assert.equal(storage.data.knowledgeProposals[proposal.id].writeReceipt, undefined);
		assert.deepEqual(storage.data.knowledgeProposals[proposal.id].payload, proposal.payload);
	}

	for (const status of ["pending", "deleted"] as const) {
		for (const proposal of [cardProposal("deleted-card"), linkProposal("deleted-link"), viewProposal("deleted-view"), updateProposal("deleted-update")]) {
			// The payload is authoritative even when optional top-level metadata is absent.
			delete proposal.conceptId;
			const storage = new RecoveryStorage({ knowledgeProposals: { [proposal.id]: proposal } });
			storage.data.conceptDeletions = { [concept.conceptId]: {
				version: 1, status, operationId: "delete-test", conceptId: concept.conceptId,
				createdAt: "2026-09-08T00:00:00.000Z", conceptPath: concept.path,
				...(status === "deleted" ? { completedAt: "2026-09-08T00:00:00.000Z" } : {
					cardIds: [], related: [], files: [{ path: concept.path, stagePath: `${concept.path}.mneme-delete-delete-test`, hash: "a".repeat(64), phase: "planned" }],
				}),
			} };
			const vault = new RecoveryVault();
			const { writer } = makeWriter(storage, vault, {});
			const result = await writer.writeApprovedProposal(proposal.id);
			assert.equal(result.status, "failed");
			assert.match(result.message, /deletion/);
			assert.equal(vault.createCount + vault.modifyCount + vault.processCount, 0);
			assert.deepEqual(storage.data.knowledgeProposals[proposal.id].payload, proposal.payload);
		}
	}

	// Every supported first-class Inbox kind is exercised by this recovery suite.
	for (const proposal of [
		conceptProposal("kind-concept"),
		cardProposal("kind-card"),
		linkProposal("kind-link"),
		viewProposal("kind-view"),
		updateProposal("kind-update"),
	]) {
		const data = createPluginData({ [proposal.id]: proposal });
		if (proposal.id === "kind-link") data.sourceAnalysisRecords["Notes/Intro.md"] = createSourceRecord("Notes/Intro.md");
		const storage = new RecoveryStorage(data);
		const vault = new RecoveryVault({ [concept.path]: "---\nmneme_type: concept\nmneme_id: concept-encapsulation\n---\n# Encapsulation\n" });
		const { writer } = makeWriter(storage, vault, {});
		const result = await writer.writeApprovedProposal(proposal.id);
		assert.equal(result.status, "written", `${proposal.id}: ${result.message}`);
	}

	// Each supported kind must recover from the same uncertain final metadata commit.
	for (const proposal of [conceptProposal("retry-kind-concept"), cardProposal("retry-kind-card"), linkProposal("retry-kind-link"), viewProposal("retry-kind-view"), updateProposal("retry-kind-update")]) {
		const data = createPluginData({ [proposal.id]: proposal });
		if (proposal.kind === "link_existing_concept") data.sourceAnalysisRecords["Notes/Intro.md"] = createSourceRecord("Notes/Intro.md");
		const storage = new RecoveryStorage(data);
		storage.failSaveOnceWhen = (candidate) =>
			Object.values(candidate.knowledgeProposals).some((p) => p.status === "written")
				|| Object.keys(candidate.conceptSourceLinks).length > 0;
		const initial = proposal.kind === "new_concept" || proposal.kind === "new_card" ? {} : {
			[concept.path]: "---\nmneme_type: concept\nmneme_id: concept-encapsulation\n---\n# Encapsulation\n",
		};
		const vault = new RecoveryVault(initial);
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed", proposal.id);
		const filesAfterFirstAttempt = [...vault.files.entries()];
		const reloadedStorage = new RecoveryStorage(storage.data);
		const reloadedVault = new RecoveryVault(Object.fromEntries(filesAfterFirstAttempt));
		const retryResult = await makeWriter(reloadedStorage, reloadedVault, {}).writer.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "written", `${proposal.id}: ${retryResult.message}`);
		assert.deepEqual([...reloadedVault.files.entries()], filesAfterFirstAttempt, `${proposal.id} rewrote Markdown on retry`);
		if (proposal.kind === "link_existing_concept") assert.equal(Object.keys(reloadedStorage.data.conceptSourceLinks).length, 1);
	}

	{
		const proposal = conceptProposal("retry-create");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		vault.failCreateOnce = true;
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "approved");
		const receipt = receiptOf(storage, proposal.id);
		assert.ok(receipt);
		for (const key of ["version", "proposalHash", "mode", "targetPath", "afterHash", "createdAt"]) {
			assert.ok(receipt && key in receipt, `receipt missing ${key}`);
		}
		assert.equal("front" in receipt, false, "receipt stores hashes and identity, never card front content");
		assert.equal("back" in receipt, false, "receipt stores hashes and identity, never card back content");
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "written");
		assert.equal(vault.createCount, 2);
	}

	{
		const proposal = conceptProposal("metadata-failure");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		storage.failSaveOnceWhen = (data) => Object.values(data.knowledgeProposals).some((p) => p.writeReceipt);
		const vault = new RecoveryVault();
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.equal(vault.files.size, 0, "receipt save failure must happen before Markdown");
	}

	{
		const proposal = conceptProposal("receipt-save-then-throw");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		storage.saveThenThrowOnceWhen = (data) => {
			const candidate = data.knowledgeProposals[proposal.id];
			return Boolean(candidate?.writeReceipt && candidate.status === "approved");
		};
		const vault = new RecoveryVault();
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.ok(receiptOf(storage, proposal.id));
		const retry = makeWriter(new RecoveryStorage(storage.data), vault, {}).writer;
		const retryResult = await retry.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "written", retryResult.message);
		assert.equal(vault.createCount, 1, "receipt-stage retry writes Markdown once");
	}

	{
		const proposal = conceptProposal("after-write-save-failure");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		vault.throwAfterCreate = true;
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "approved");
		assert.ok(receiptOf(storage, proposal.id));
		const retryResult = await writer.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "written", retryResult.message);
		assert.equal(vault.createCount, 1, "retry reuses the receipt path after an after-write throw");
	}

	{
		const proposal = conceptProposal("post-write-metadata-failure", { payload: {
			coreMeaning: "Hides representation.", title: "Encapsulation",
			proposedSourceLinks: [{ relationType: "supporting", sourcePath: "Notes/Intro.md" }],
		} });
		const data = createPluginData({ [proposal.id]: proposal });
		data.sourceAnalysisRecords["Notes/Intro.md"] = createSourceRecord("Notes/Intro.md");
		const storage = new RecoveryStorage(data);
		storage.saveThenThrowOnceWhen = (candidate) =>
			Object.values(candidate.knowledgeProposals).some((p) => p.status === "written")
				|| Object.keys(candidate.conceptSourceLinks).length > 0;
		const vault = new RecoveryVault();
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "written");
		assert.equal(vault.files.size, 1, "post-write save failure leaves Markdown in place");
		const reloadedStorage = new RecoveryStorage(storage.data);
		const retry = makeWriter(reloadedStorage, vault, {}).writer;
		const retryResult = await retry.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "written", retryResult.message);
		assert.equal(vault.createCount, 1, "retry does not rewrite applied Markdown");
	}

	{
		const proposal = cardProposal("after-process-save-failure");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const cardPath = "Mneme/Cards/Encapsulation/Cards.md";
		const vault = new RecoveryVault({
			[cardPath]: "---\nmneme_type: card_group\nmneme_concept_id: concept-encapsulation\n---\n# Encapsulation Cards\n",
		});
		vault.throwAfterProcess = true;
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "approved");
		assert.ok(receiptOf(storage, proposal.id));
		const retryResult = await writer.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "written", retryResult.message);
		assert.equal(vault.processCount, 1, "retry must not append a second card after an after-process throw");
	}

	{
		const proposal = cardProposal("concurrent");
		const data = createPluginData({ [proposal.id]: proposal });
		data.reviewStates["card-existing"] = {
			cardId: "card-existing", createdAt: "2026-01-01T00:00:00.000Z", lapseCount: 2,
			reviewCount: 4, lastRating: "good", updatedAt: "2026-01-01T00:00:00.000Z",
		};
		const storage = new RecoveryStorage(data);
		const vault = new RecoveryVault();
		const first = makeWriter(storage, vault, {}).writer;
		const second = makeWriter(storage, vault, {}).writer;
		const [a, b] = await Promise.all([first.writeApprovedProposal(proposal.id), second.writeApprovedProposal(proposal.id)]);
		assert.equal(a.status === "written" || b.status === "written", true);
		assert.equal(a.status, "written");
		assert.equal(b.status, "written");
		assert.equal(vault.processCount + vault.createCount, 1, "concurrent writers must produce one card write");
		assert.deepEqual(storage.data.reviewStates["card-existing"], data.reviewStates["card-existing"]);
	}

	{
		const proposal = conceptProposal("writer-review-concurrency");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		const releaseWrite = vault.armWriteBarrier();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
		await reviews.load();
		const writerPromise = makeWriter(storage, vault, {}).writer.writeApprovedProposal(proposal.id);
		await vault.waitForWriteStart();
		const reviewPromise = reviews.recordReview("card-existing", "good");
		releaseWrite();
		const [writeResult] = await Promise.all([writerPromise, reviewPromise]);
		assert.equal(writeResult.status, "written");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "written");
		assert.equal(storage.data.reviewStates["card-existing"]?.lastRating, "good");
		assert.equal(Object.keys(storage.data.reviewEvents).length, 1);
	}

	{
		const first = conceptProposal("reserved-first");
		const second = conceptProposal("reserved-second");
		const storage = new RecoveryStorage(createPluginData({ [first.id]: first, [second.id]: second }));
		const vault = new RecoveryVault();
		vault.failCreateOnce = true;
		assert.equal((await makeWriter(storage, vault, {}).writer.writeApprovedProposal(first.id)).status, "failed");
		assert.equal((await makeWriter(storage, vault, {}).writer.writeApprovedProposal(second.id)).status, "written");
		const firstReceipt = storage.data.knowledgeProposals[first.id]!.writeReceipt!;
		const secondReceipt = storage.data.knowledgeProposals[second.id]!.writeReceipt!;
		assert.notEqual(firstReceipt.entityId, secondReceipt.entityId, "pending intent reserves its identity even before Markdown exists");
		assert.notEqual(firstReceipt.targetPath, secondReceipt.targetPath, "pending intent reserves its Concept path");
		assert.equal((await makeWriter(storage, vault, {}).writer.writeApprovedProposal(first.id)).status, "written");
		assert.equal(vault.files.size, 2);
		assert.equal(storage.data.knowledgeProposals[first.id]?.payload, undefined, "completed receipts retain no learning-content copy");
	}

	{
		const proposal = conceptProposal("edited-pending-payload");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		vault.failCreateOnce = true;
		await makeWriter(storage, vault, {}).writer.writeApprovedProposal(proposal.id);
		storage.data.knowledgeProposals[proposal.id] = conceptProposal(proposal.id, {
			...storage.data.knowledgeProposals[proposal.id], payload: { title: "Changed after approval" },
		});
		const result = await makeWriter(storage, vault, {}).writer.writeApprovedProposal(proposal.id);
		assert.equal(result.status, "failed");
		assert.match(result.message, /proposal changed/);
		assert.equal(vault.files.size, 0);
	}

	for (const proposal of [linkProposal("race-link"), viewProposal("race-view"), updateProposal("race-update")]) {
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault({ [concept.path]: "# Encapsulation\n\n## Core Meaning\n\nOriginal.\n" });
		const edit = `${await vault.read(concept.path)}\nUser edit before write.\n`;
		vault.beforeNextProcess = () => { vault.files.set(concept.path, edit); };
		const result = await makeWriter(storage, vault, {}).writer.writeApprovedProposal(proposal.id);
		assert.equal(result.status, "failed");
		assert.match(result.message, /changed after preview/);
		assert.equal(await vault.read(concept.path), edit);
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "approved");
	}

	{
		const proposal = conceptProposal("user-edit");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		storage.failSaveOnceWhen = (data) => Object.values(data.knowledgeProposals).some((p) => p.status === "written");
		const { writer } = makeWriter(storage, vault, {});
		await writer.writeApprovedProposal(proposal.id);
		const receipt = receiptOf(storage, proposal.id)!;
		const originalPath = String(receipt.targetPath);
		const originalMarkdown = await vault.read(originalPath);
		await vault.modify(originalPath, `${originalMarkdown}\nLearner edited this.\n`);
		// A fresh process reconstructs both storage and writer from the persisted receipt.
		const reloadedStorage = new RecoveryStorage(storage.data);
		const retry = makeWriter(reloadedStorage, vault, {}).writer;
		const retryResult = await retry.writeApprovedProposal(proposal.id);
		assert.equal(retryResult.status, "failed");
		assert.deepEqual(retryResult.targetPaths, [originalPath]);
		assert.match(await vault.read(originalPath), /Learner edited this/);
		assert.equal(vault.files.size, 1);
	}

	{
		const proposal = conceptProposal("malformed-receipt");
		const raw: unknown = {
			...createPluginData({ [proposal.id]: proposal }),
			knowledgeProposals: { [proposal.id]: { ...proposal, writeReceipt: { version: 1, mode: "create" } } },
		};
		const storage = new RecoveryStorage(raw);
		const { writer } = makeWriter(storage, new RecoveryVault(), {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
	}

	{
		const proposal = conceptProposal("occupied");
		const storage = new RecoveryStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new RecoveryVault();
		vault.failCreateOnce = true;
		const { writer } = makeWriter(storage, vault, {});
		assert.equal((await writer.writeApprovedProposal(proposal.id)).status, "failed");
		const reservedPath = String(receiptOf(storage, proposal.id)?.targetPath);
		vault.files.set(reservedPath, "# Someone else's Concept\n");
		const retry = makeWriter(new RecoveryStorage(storage.data), vault, {}).writer;
		const result = await retry.writeApprovedProposal(proposal.id);
		assert.equal(result.status, "failed");
		assert.deepEqual(result.targetPaths, [reservedPath]);
		assert.equal(await vault.read(reservedPath), "# Someone else's Concept\n");
		assert.equal(vault.createCount, 1, "recovery must not allocate a second path or overwrite another user's file");
	}
}

export const done = run();
