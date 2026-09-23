import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	IncomingConceptMergeService,
	type IncomingConceptMergeStorage,
	type IncomingConceptMergeVault,
	type PrepareIncomingConceptMergeInput,
} from "../src/services/incomingConceptMergeService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { incomingMergeMarkdownHash, incomingMergeOriginHash } from "../src/services/incomingConceptMergeRecovery";

const now = "2026-09-23T10:00:00.000Z";
const existing: ConceptSummary = {
	conceptId: "concept-existing",
	coreMeaning: "Existing meaning.",
	importance: "normal",
	learningMode: "reviewable",
	path: "Mneme/Concepts/Existing.md",
	tags: ["existing"],
	title: "Shared title",
	whyItMatters: "Existing value.",
};

type IncomingReceipt = {
	version: 1;
	status: "pending" | "written" | "not-applied";
	operationId: string;
	conceptId: string;
	path: string;
	beforeHash: string;
	afterHash: string;
	createdAt: string;
	origin: Record<string, unknown>;
};

async function runAsyncTests(): Promise<void> {
	const proposal = makeProposal();
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	const storage = new RecoveryStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);
	const input = inboxInput(proposal.id, proposal.updatedAt);

	const preview = await service.prepare(input);
	assert.equal(preview.status, "ready");
	assert.equal(storage.saveCount, 0, "preview must not persist a recovery intent");
	assert.equal(vault.modifyCount, 0, "preview must not write Markdown");
	if (preview.status !== "ready") throw new Error(preview.message);
	const result = await service.execute(preview.plan);
	assert.deepEqual(result, { status: "merged" });
	assert.equal(vault.modifyCount, 1);
	const written = readReceipt(storage.data);
	assert.equal(written?.status, "written");
	assert.equal(written?.beforeHash, await incomingMergeMarkdownHash(preview.plan.before));
	assert.equal(written?.afterHash, await incomingMergeMarkdownHash(preview.plan.after));
	assert.match(preview.plan.after, /Incoming meaning/);

	// A second service instance must treat the written receipt as an idempotent completion.
	const repeated = await new IncomingConceptMergeService(vault, storage, () => now).resume();
	assert.equal(repeated.status, "merged");
	assert.equal(vault.modifyCount, 1, "resume must never rewrite an already written merge");

	await testCompletionSaveRecovery(proposal, preview.plan.after);
	await testProcessFailureRecovery(proposal);
	await testManualCompletionSaveRecovery();
	await testFaultMatrix(proposal);
	await testEqualHashResume(proposal);
	await testNotAppliedRecovery(proposal);
	await testFailClosedCases(proposal);
}

async function testCompletionSaveRecovery(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
	after: string,
): Promise<void> {
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	const storage = new RecoveryStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);
	const prepared = await service.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	storage.throwBeforeSaveNumber = 2; // intent succeeds; completion save fails
	const failed = await service.execute(prepared.plan);
	assert.equal(failed.status, "failed");
	assert.equal(vault.files[existing.path], prepared.plan.after);
	assert.equal(readReceipt(storage.data)?.status, "pending");
	assert.equal(await incomingMergeMarkdownHash(await vault.read(existing.path)), await incomingMergeMarkdownHash(after));

	const resumed = await new IncomingConceptMergeService(vault, storage, () => now).resume();
	assert.equal(resumed.status, "merged");
	assert.equal(vault.modifyCount, 1, "resume completes state without a second Markdown write");
	assert.equal(readReceipt(storage.data)?.status, "written");
}

async function testProcessFailureRecovery(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
): Promise<void> {
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	vault.throwAfterProcessOnce = true;
	const storage = new RecoveryStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);
	const prepared = await service.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	assert.equal((await service.execute(prepared.plan)).status, "failed");
	assert.equal(readReceipt(storage.data)?.status, "pending");
	assert.equal(vault.files[existing.path], prepared.plan.after);
	const resumed = await new IncomingConceptMergeService(vault, storage, () => now).resume();
	assert.equal(resumed.status, "merged");
	assert.equal(vault.modifyCount, 1);
}

async function testManualCompletionSaveRecovery(): Promise<void> {
	const draft = {
		coreMeaning: "Manual incoming meaning.",
		draftId: "manual-draft",
		englishName: "",
		importance: "high" as const,
		learningMode: "reviewable" as const,
		sourcePath: "Notes/Manual.md",
		tags: ["manual"],
		title: "Shared title",
		updatedAt: now,
		whyItMatters: "Manual incoming value.",
	};
	const data = createDefaultPluginData();
	data.manualConceptDraft = draft;
	data.manualConceptDraftId = draft.draftId;
	data.sourceAnalysisRecords["Notes/Manual.md"] = {
		sourcePath: "Notes/Manual.md", contentHash: "a".repeat(64), mtime: 2, size: 20,
		lastAnalyzedAt: now, linkedConceptIds: [], pendingProposalIds: [], status: "clean",
	};
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	const storage = new RecoveryStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);
	const prepared = await service.prepare({
		draft: { coreMeaning: "Existing meaning.", englishName: "", importance: "high", learningMode: "reviewable", tags: ["manual"], title: "Shared title", whyItMatters: "Existing value." },
		existing,
		origin: { kind: "manual", input: draft, source: { contentHash: "a".repeat(64), mtime: 2, path: "Notes/Manual.md", size: 20 } },
	});
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	storage.throwBeforeSaveNumber = 2;
	assert.equal((await service.execute(prepared.plan)).status, "failed");
	assert.equal(readReceipt(storage.data)?.status, "pending");
	assert.equal(storage.data.manualConceptDraftId, draft.draftId, "pending recovery preserves the source draft");
	storage.data.sourceAnalysisRecords["Notes/Manual.md"] = {
		sourcePath: "Notes/Manual.md", contentHash: "b".repeat(64), mtime: 99, size: 999,
		lastAnalyzedAt: "2026-09-23T10:30:00.000Z", linkedConceptIds: ["other-concept"], pendingProposalIds: [], status: "clean",
	};
	assert.equal((await new IncomingConceptMergeService(vault, storage, () => now).resume()).status, "merged");
	assert.equal(readReceipt(storage.data)?.status, "written");
	assert.notEqual(storage.data.manualConceptDraftId, draft.draftId, "manual source rotates once after completion");
	const manualRecord = storage.data.sourceAnalysisRecords["Notes/Manual.md"];
	assert.equal(manualRecord?.contentHash, "b".repeat(64));
	assert.equal(manualRecord?.mtime, 99);
	assert.equal(manualRecord?.size, 999);
	assert.ok(manualRecord?.linkedConceptIds.includes("other-concept"));
	assert.ok(manualRecord?.linkedConceptIds.includes(existing.conceptId));
	const manualIdAfter = storage.data.manualConceptDraftId;
	assert.equal((await new IncomingConceptMergeService(vault, storage, () => now).resume()).status, "merged");
	assert.equal(storage.data.manualConceptDraftId, manualIdAfter, "repeated manual resume does not rotate again");
}

async function testFaultMatrix(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
): Promise<void> {
	const cases: Array<{ name: string; before?: number; after?: number; process?: "before" | "after"; expected: "before" | "after" }> = [
		{ name: "save1-before", before: 1, expected: "before" },
		{ name: "save1-after", after: 1, expected: "before" },
		{ name: "save2-before", before: 2, expected: "after" },
		{ name: "save2-after", after: 2, expected: "after" },
		{ name: "process-before", process: "before", expected: "before" },
		{ name: "process-after", process: "after", expected: "after" },
	];
	for (const kind of ["inbox", "manual"] as const) for (const testCase of cases) {
		const label = `${kind}/${testCase.name}`;
		const data = createDefaultPluginData();
		const manualDraft = { ...inboxInput(proposal.id, proposal.updatedAt).draft, draftId: "manual-matrix", updatedAt: now };
		const input: PrepareIncomingConceptMergeInput = inboxInput(proposal.id, proposal.updatedAt);
		if (kind === "inbox") data.knowledgeProposals[proposal.id] = proposal;
		else {
			data.manualConceptDraft = manualDraft;
			data.manualConceptDraftId = manualDraft.draftId;
			input.origin = { kind: "manual", input: manualDraft };
		}
		data.conceptConflictMergeDrafts[kind === "inbox" ? `inbox:${proposal.id}` : "manual"] = {
			key: kind === "inbox" ? `inbox:${proposal.id}` : "manual", draft: input.draft,
			existingConceptId: existing.conceptId, incomingFingerprint: "original", updatedAt: now,
		};
		const original = structuredClone(data);
		const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
		if (testCase.process === "before") vault.throwBeforeProcessOnce = true;
		if (testCase.process === "after") vault.throwAfterProcessOnce = true;
		const storage = new RecoveryStorage(data);
		storage.throwBeforeSaveNumber = testCase.before;
		storage.throwAfterSaveNumber = testCase.after;
		const service = new IncomingConceptMergeService(vault, storage, () => now);
		const prepared = await service.prepare(input);
		assert.equal(prepared.status, "ready", label);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.equal((await service.execute(prepared.plan)).status, "failed", label);
		assert.equal(vault.files[existing.path], testCase.expected === "after" ? prepared.plan.after : prepared.plan.before, label);
		assert.equal(readReceipt(storage.data)?.status, testCase.name === "save1-before" ? undefined
			: testCase.name === "save2-after" ? "written" : "pending", label);
		if (readReceipt(storage.data)?.status === "pending") {
			assert.equal((await service.prepare(input)).status, "blocked", `${label}: a second operation cannot replace a pending receipt`);
		}
		const saved = JSON.stringify(storage.data);
		const reconstructed = new RecoveryStorage(JSON.parse(saved) as MnemePluginData);
		reconstructed.data.settings.showAdvancedDiagnostics = true;
		reconstructed.data.reviewEvents["unrelated-event"] = { cardId: "unrelated-card", eventId: "unrelated-event", rating: "good", reviewedAt: now };
		const resumedService = new IncomingConceptMergeService(vault, reconstructed, () => now);
		const resumed = await resumedService.resume();
		if (testCase.expected === "before") {
			assert.equal(resumed.status, testCase.name === "save1-before" ? "none" : "not-applied", label);
			assert.equal(vault.modifyCount, 0, label);
			assert.equal(reconstructed.data.incomingConceptMerge?.status, testCase.name === "save1-before" ? undefined : "not-applied", label);
			if (testCase.name !== "save1-before") {
				assert.equal((await resumedService.execute(prepared.plan)).status, "conflict", `${label}: old confirmation cannot replay a released operation`);
				assert.equal(vault.modifyCount, 0, label);
			}
			assert.deepEqual(reconstructed.data.knowledgeProposals, original.knowledgeProposals, label);
			assert.deepEqual(reconstructed.data.manualConceptDraft, original.manualConceptDraft, label);
			assert.deepEqual(reconstructed.data.conceptConflictMergeDrafts, original.conceptConflictMergeDrafts, label);
			assert.equal((await resumedService.prepare(input)).status, "ready", `${label}: a fresh reviewed attempt is available`);
		} else {
			assert.equal(resumed.status, "merged", label);
			assert.equal(vault.modifyCount, 1, `${label}: recovery must not rewrite Markdown`);
			assert.deepEqual(reconstructed.data.conceptConflictMergeDrafts, {}, label);
			if (kind === "inbox") assert.equal(reconstructed.data.knowledgeProposals[proposal.id]?.status, "written", label);
			else {
				assert.notEqual(reconstructed.data.manualConceptDraftId, manualDraft.draftId, label);
				assert.equal(reconstructed.data.manualConceptDraft?.title, "", label);
			}
			const completed = JSON.stringify(reconstructed.data);
			assert.equal((await resumedService.resume()).status, "merged", label);
			assert.equal((await resumedService.execute(prepared.plan)).status, "merged", label);
			assert.equal(JSON.stringify(reconstructed.data), completed, `${label}: repeats cannot consume the origin or rotate identity again`);
			assert.equal(vault.files[existing.path], prepared.plan.after, `${label}: no duplicate Views or Source notes`);
			assert.equal(vault.modifyCount, 1, label);
		}
		assert.equal(reconstructed.data.settings.showAdvancedDiagnostics, true, label);
		assert.ok(reconstructed.data.reviewEvents["unrelated-event"], label);
		assert.equal(JSON.stringify(readReceipt(storage.data) ?? {}).includes("Incoming meaning"), false, `${label}: content-free receipt`);
	}

}

async function testEqualHashResume(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
): Promise<void> {
	const markdown = conceptMarkdown(existing);
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	const receipt: IncomingReceipt = {
		version: 1,
		status: "pending",
		operationId: "equal-hash-operation",
		conceptId: existing.conceptId,
		path: existing.path,
		beforeHash: await incomingMergeMarkdownHash(markdown),
		afterHash: await incomingMergeMarkdownHash(markdown),
		createdAt: now,
		origin: { kind: "inbox", proposalId: proposal.id, inputHash: await incomingMergeOriginHash(data, { kind: "inbox", proposalId: proposal.id }) },
	};
	(data as Record<string, unknown>).incomingConceptMerge = receipt;
	const vault = new RecoveryVault({ [existing.path]: markdown });
	const storage = new RecoveryStorage(data);
	assert.equal((await new IncomingConceptMergeService(vault, storage, () => now).resume()).status, "merged");
	assert.equal(vault.modifyCount, 0, "equal before/after hash resumes without Markdown write");
	assert.equal(readReceipt(storage.data)?.status, "written");
}

async function testNotAppliedRecovery(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
): Promise<void> {
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	vault.throwBeforeProcessOnce = true;
	const storage = new RecoveryStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);
	const prepared = await service.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	assert.equal((await service.execute(prepared.plan)).status, "failed");
	assert.equal(readReceipt(storage.data)?.status, "pending");
	const resumed = await new IncomingConceptMergeService(vault, storage, () => now).resume();
	assert.deepEqual(resumed, { status: "not-applied" });
	assert.equal(readReceipt(storage.data)?.status, "not-applied");
	assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, proposal.status);
	assert.equal(vault.modifyCount, 0);
}

async function testFailClosedCases(
	proposal: Extract<KnowledgeProposal, { kind: "new_concept" }>,
): Promise<void> {
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	(data as Record<string, unknown>).incomingConceptMerge = { version: 999, status: "pending" };
	const storage = new RecoveryStorage(data);
	const vault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	const result = await new IncomingConceptMergeService(vault, storage, () => now).resume();
	assert.equal(result.status, "failed");
	assert.deepEqual((storage.data as Record<string, unknown>).incomingConceptMerge, { version: 999, status: "pending" });

	const changedData = createDefaultPluginData();
	changedData.knowledgeProposals[proposal.id] = { ...proposal, updatedAt: "2026-09-23T11:00:00.000Z" };
	const changedStorage = new RecoveryStorage(changedData);
	const changedVault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	const changedService = new IncomingConceptMergeService(changedVault, changedStorage, () => now);
	const prepared = await changedService.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(prepared.status, "blocked", "origin changes must block a new preview");

	// Once an intent exists, a changed target is preserved and remains recoverable evidence.
	const targetData = createDefaultPluginData();
	targetData.knowledgeProposals[proposal.id] = proposal;
	const targetVault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	targetVault.throwBeforeProcessOnce = true;
	const targetStorage = new RecoveryStorage(targetData);
	const targetService = new IncomingConceptMergeService(targetVault, targetStorage, () => now);
	const targetPreview = await targetService.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(targetPreview.status, "ready");
	if (targetPreview.status !== "ready") throw new Error(targetPreview.message);
	assert.equal((await targetService.execute(targetPreview.plan)).status, "failed");
	targetVault.files[existing.path] += "\nLearner edit after interruption\n";
	const targetResume = await new IncomingConceptMergeService(targetVault, targetStorage, () => now).resume();
	assert.notEqual(targetResume.status, "merged");
	assert.equal(readReceipt(targetStorage.data)?.status, "pending");

	// A changed source proposal also blocks completion; the receipt is retained for review.
	const originData = createDefaultPluginData();
	originData.knowledgeProposals[proposal.id] = proposal;
	const originVault = new RecoveryVault({ [existing.path]: conceptMarkdown(existing) });
	originVault.throwBeforeProcessOnce = true;
	const originStorage = new RecoveryStorage(originData);
	const originService = new IncomingConceptMergeService(originVault, originStorage, () => now);
	const originPreview = await originService.prepare(inboxInput(proposal.id, proposal.updatedAt));
	assert.equal(originPreview.status, "ready");
	if (originPreview.status !== "ready") throw new Error(originPreview.message);
	assert.equal((await originService.execute(originPreview.plan)).status, "failed");
	originStorage.data.knowledgeProposals[proposal.id] = { ...proposal, updatedAt: "2026-09-23T11:00:00.000Z" };
	const originResume = await new IncomingConceptMergeService(originVault, originStorage, () => now).resume();
	assert.notEqual(originResume.status, "merged");
	assert.equal(readReceipt(originStorage.data)?.status, "pending");
}

function inboxInput(proposalId: string, proposalUpdatedAt: string) {
	return {
		draft: { coreMeaning: "Existing meaning.\n\nIncoming meaning.", englishName: "", importance: "normal" as const, learningMode: "reviewable" as const, tags: ["existing", "incoming"], title: "Shared title", whyItMatters: "Existing value." },
		existing,
		origin: { kind: "inbox" as const, proposalId, proposalUpdatedAt },
	};
}

function makeProposal(): Extract<KnowledgeProposal, { kind: "new_concept" }> {
	return {
		createdAt: "2026-09-23T09:00:00.000Z",
		updatedAt: "2026-09-23T09:30:00.000Z",
		id: "recovery-proposal",
		kind: "new_concept",
		status: "edited",
		sourcePath: "Notes/Source.md",
		sourceHash: "source-hash",
		evidence: [{ excerpt: "Incoming evidence" }],
		payload: { title: "Incoming", coreMeaning: "Incoming meaning.", whyItMatters: "Incoming value.", tags: ["incoming"], proposedViews: [{ title: "Incoming View", body: "A unique incoming perspective." }], proposedSourceLinks: [] },
	};
}

function readReceipt(data: MnemePluginData): IncomingReceipt | undefined {
	return (data as Record<string, unknown>).incomingConceptMerge as IncomingReceipt | undefined;
}

class RecoveryVault implements IncomingConceptMergeVault {
	modifyCount = 0;
	throwBeforeProcessOnce = false;
	throwAfterProcessOnce = false;
	constructor(public files: Record<string, string>) {}
	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		const current = await this.read(path);
		if (this.throwBeforeProcessOnce) {
			this.throwBeforeProcessOnce = false;
			throw new Error("Injected before-process failure");
		}
		this.files[path] = transform(current);
		this.modifyCount += 1;
		if (this.throwAfterProcessOnce) {
			this.throwAfterProcessOnce = false;
			throw new Error("Injected after-process failure");
		}
	}
}

class RecoveryStorage implements IncomingConceptMergeStorage {
	saveCount = 0;
	saveAttemptCount = 0;
	throwBeforeSaveNumber?: number;
	throwAfterSaveNumber?: number;
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: MnemePluginData): Promise<void> {
		const attempt = this.saveAttemptCount + 1;
		this.saveAttemptCount = attempt;
		if (this.throwBeforeSaveNumber === attempt) {
			this.throwBeforeSaveNumber = undefined;
			throw new Error(`Injected save ${attempt} failure`);
		}
		this.data = data;
		this.saveCount += 1;
		if (this.throwAfterSaveNumber === attempt) {
			this.throwAfterSaveNumber = undefined;
			throw new Error(`Injected after-save ${attempt} failure`);
		}
	}
}

function conceptMarkdown(concept: ConceptSummary): string {
	return ["---", "mneme_type: concept", `mneme_id: ${concept.conceptId}`, `mneme_title: \"${concept.title}\"`, "mneme_version: 1", "cards: \"[[Mneme/Cards/Existing/Cards|Existing Cards]]\"", "learning_mode: reviewable", "importance: normal", "tags: [existing]", "---", `# ${concept.title}`, "", "## Core Meaning", "", concept.coreMeaning ?? "", "", "## Why It Matters", "", concept.whyItMatters ?? "", "", "## Review Cards", "", "Cards: [[Mneme/Cards/Existing/Cards|Existing Cards]]", ""].join("\n");
}

export const done = runAsyncTests();
