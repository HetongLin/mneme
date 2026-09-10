import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	IncomingConceptMergeService,
	type IncomingConceptMergeStorage,
	type IncomingConceptMergeVault,
} from "../src/services/incomingConceptMergeService";
import { ManualConceptDraftStore } from "../src/services/manualConceptDraftStore";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

const now = "2026-07-25T10:00:00.000Z";
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

function manualWriteReceipt(draftId: string, status: "pending" | "written" = "pending") {
	return {
		version: 1 as const,
		draftId,
		inputHash: "a".repeat(64),
		conceptId: "concept-incoming",
		path: "Mneme/Concepts/Incoming.md",
		cardsPath: "Mneme/Cards/Incoming/Cards.md",
		afterHash: "b".repeat(64),
		englishAliasesEnabled: true,
		createdAt: now,
		status,
	};
}

async function runAsyncTests(): Promise<void> {
	const proposal = {
		createdAt: "2026-07-25T09:00:00.000Z",
		evidence: [{ excerpt: "Incoming evidence." }],
		id: "proposal-conflict",
		kind: "new_concept" as const,
		payload: {
			coreMeaning: "Incoming meaning.",
			proposedSourceLinks: [{
				evidence: [{ excerpt: "Incoming evidence." }],
				relationType: "origin" as const,
				sourceHash: "source-hash",
				sourcePath: "Notes/Source.md",
			}],
			proposedViews: [{
				body: "A preserved incoming view.",
				title: "Incoming View",
			}],
			tags: ["incoming"],
			title: "Shared title",
			whyItMatters: "Incoming value.",
		},
		sourceHash: "source-hash",
		sourcePath: "Notes/Source.md",
		status: "edited" as const,
		updatedAt: "2026-07-25T09:30:00.000Z",
	};
	const data = createDefaultPluginData();
	data.knowledgeProposals[proposal.id] = proposal;
	data.conceptConflictMergeDrafts[`inbox:${proposal.id}`] = {
		draft: {
			coreMeaning: "Existing meaning.\n\nIncoming meaning.",
			englishName: "",
			importance: "normal",
			learningMode: "reviewable",
			tags: ["existing", "incoming"],
			title: "Shared title",
			whyItMatters: "Existing value.\n\nIncoming value.",
		},
		existingConceptId: existing.conceptId,
		incomingFingerprint: "fingerprint",
		key: `inbox:${proposal.id}`,
		updatedAt: now,
	};
	data.sourceAnalysisRecords["Notes/Source.md"] = {
		contentHash: "source-hash",
		lastAnalyzedAt: "2026-07-25T09:00:00.000Z",
		linkedConceptIds: [],
		mtime: 1,
		pendingProposalIds: [proposal.id],
		size: 10,
		sourcePath: "Notes/Source.md",
		status: "clean",
	};
	const completeDataFixture = structuredClone(data);
	const vault = new MemoryIncomingMergeVault({
		[existing.path]: conceptMarkdown(existing),
	});
	const storage = new MemoryIncomingMergeStorage(data);
	const service = new IncomingConceptMergeService(vault, storage, () => now);

	const prepared = await service.prepare({
		draft: {
			coreMeaning: "Existing meaning.\n\nIncoming meaning.",
			englishName: "",
			importance: "normal",
			learningMode: "reviewable",
			tags: ["existing", "incoming"],
			title: "Shared title",
			whyItMatters: "Existing value.\n\nIncoming value.",
		},
		existing,
		origin: {
			kind: "inbox",
			proposalId: proposal.id,
			proposalUpdatedAt: proposal.updatedAt,
		},
	});

	assert.equal(prepared.status, "ready");
	assert.equal(vault.modifyCount, 0);
	assert.equal(storage.saveCount, 0);
	assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "edited");
	if (prepared.status !== "ready") throw new Error(prepared.message);
	assert.match(prepared.plan.after, /Incoming meaning\./);
	assert.match(prepared.plan.after, /### Incoming View/);
	assert.match(prepared.plan.after, /\[\[Notes\/Source\]\]/);

	const result = await service.execute(prepared.plan);

	assert.deepEqual(result, { status: "merged" });
	assert.equal(vault.modifyCount, 1);
	assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "written");
	assert.equal(storage.data.conceptConflictMergeDrafts[`inbox:${proposal.id}`], undefined);
	assert.equal(
		Object.values(storage.data.conceptSourceLinks)[0]?.conceptId,
		existing.conceptId,
	);
	assert.deepEqual(
		storage.data.sourceAnalysisRecords["Notes/Source.md"]?.linkedConceptIds,
		[existing.conceptId],
	);

	{
		const raceVault = new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) });
		const raceData = createDefaultPluginData();
		raceData.knowledgeProposals[proposal.id] = proposal;
		const raceStorage = new MemoryIncomingMergeStorage(raceData);
		const raceService = new IncomingConceptMergeService(raceVault, raceStorage, () => now);
		const racePrepared = await raceService.prepare({
			draft: {
				coreMeaning: "Merged.", englishName: "", importance: "normal", learningMode: "reviewable",
				tags: [], title: "Shared title", whyItMatters: "",
			},
			existing,
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(racePrepared.status, "ready");
		if (racePrepared.status !== "ready") throw new Error(racePrepared.message);
		raceVault.racePath = existing.path;
		raceVault.raceEdit = "\nEdit made after the initial check\n";
		const raceResult = await raceService.execute(racePrepared.plan);

		assert.equal(raceResult.status, "conflict");
		assert.match(raceVault.files[existing.path] ?? "", /Edit made after the initial check/);
		assert.equal(raceStorage.saveCount, 0);
	}

	{
		const previewData = createDefaultPluginData();
		previewData.knowledgeProposals[proposal.id] = proposal;
		const previewVault = new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) });
		const previewStorage = new MemoryIncomingMergeStorage(previewData);
		const previewService = new IncomingConceptMergeService(previewVault, previewStorage, () => now);
		const prepared = await previewService.prepare({
			draft: { coreMeaning: "Merged.", englishName: "", importance: "normal", learningMode: "reviewable", tags: [], title: "Shared title", whyItMatters: "" },
			existing,
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		previewStorage.data.manualConceptWrite = manualWriteReceipt("draft-pending");
		const result = await previewService.execute(prepared.plan);
		assert.equal(result.status, "conflict");
		assert.equal(previewVault.modifyCount, 0);
	}

	{
		const oldDraft = {
			coreMeaning: "Manual incoming meaning.",
			draftId: "manual-draft-old",
			englishName: "",
			importance: "high" as const,
			learningMode: "reviewable" as const,
			tags: ["manual"],
			title: "Shared title",
			updatedAt: "2026-07-25T09:45:00.000Z",
			whyItMatters: "Manual incoming value.",
		};
		const manualData = createDefaultPluginData();
		manualData.manualConceptDraft = oldDraft;
		manualData.manualConceptDraftId = oldDraft.draftId;
		const manualStorage = new MemoryIncomingMergeStorage(manualData);
		const manualService = new IncomingConceptMergeService(
			new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) }),
			manualStorage,
			() => now,
		);
		const prepared = await manualService.prepare({
			draft: { coreMeaning: "Existing meaning.", englishName: "", importance: "high", learningMode: "reviewable", tags: ["manual"], title: "Shared title", whyItMatters: "Existing value." },
			existing,
			origin: { input: oldDraft, kind: "manual" },
		});
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.deepEqual(await manualService.execute(prepared.plan), { status: "merged" });
		const store = new ManualConceptDraftStore(manualStorage);
		await assert.rejects(store.saveDraft(oldDraft), /out of date/);
		await assert.rejects(store.clearDraft(oldDraft.draftId), /out of date/);
		assert.equal(manualStorage.data.manualConceptDraft?.title, "");
		assert.notEqual(manualStorage.data.manualConceptDraftId, oldDraft.draftId);
	}

	{
		const storedDraft = {
			coreMeaning: "Same text.", draftId: "draft-a", englishName: "", importance: "normal" as const,
			learningMode: "reviewable" as const, tags: [], title: "Same title", updatedAt: now, whyItMatters: "",
		};
		const data = createDefaultPluginData();
		data.manualConceptDraft = storedDraft;
		data.manualConceptDraftId = storedDraft.draftId;
		const service = new IncomingConceptMergeService(
			new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) }),
			new MemoryIncomingMergeStorage(data),
			() => now,
		);
		const result = await service.prepare({
			draft: { coreMeaning: "Existing meaning.", englishName: "", importance: "normal", learningMode: "reviewable", tags: [], title: "Shared title", whyItMatters: "" },
			existing,
			origin: { input: { ...storedDraft, draftId: "draft-b" }, kind: "manual" },
		});
		assert.equal(result.status, "blocked");
		assert.match(result.message, /draft changed/);
	}

	{
		const data = createDefaultPluginData();
		data.manualConceptDraft = { coreMeaning: "Meaning", englishName: "", importance: "normal", learningMode: "reviewable", tags: [], title: "Shared title", updatedAt: now, whyItMatters: "", draftId: "draft-pending" };
		data.manualConceptDraftId = "draft-pending";
		data.manualConceptWrite = manualWriteReceipt("draft-pending");
		const service = new IncomingConceptMergeService(
			new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) }),
			new MemoryIncomingMergeStorage(data),
			() => now,
		);
		const result = await service.prepare({
			draft: { coreMeaning: "Existing meaning.", englishName: "", importance: "normal", learningMode: "reviewable", tags: [], title: "Shared title", whyItMatters: "" },
			existing,
			origin: { input: { ...data.manualConceptDraft }, kind: "manual" },
		});
		assert.equal(result.status, "blocked");
		assert.match(result.message, /pending Concept creation/);
	}

	{
		const manualDraft = {
			coreMeaning: "Manual incoming meaning.",
			englishName: "",
			importance: "high" as const,
			learningMode: "reviewable" as const,
			sourcePath: "Notes/Manual.md",
			tags: ["manual"],
			title: "Shared title",
			updatedAt: "2026-07-25T09:45:00.000Z",
			whyItMatters: "Manual incoming value.",
		};
		const manualData = createDefaultPluginData();
		manualData.manualConceptDraft = manualDraft;
		const manualVault = new MemoryIncomingMergeVault({
			[existing.path]: conceptMarkdown(existing),
		});
		const manualStorage = new MemoryIncomingMergeStorage(manualData);
		const manualService = new IncomingConceptMergeService(manualVault, manualStorage, () => now);

		const manualPrepared = await manualService.prepare({
			draft: {
				coreMeaning: "Existing meaning.\n\nManual incoming meaning.",
				englishName: "",
				importance: "high",
				learningMode: "reviewable",
				tags: ["existing", "manual"],
				title: "Shared title",
				whyItMatters: "Existing value.\n\nManual incoming value.",
			},
			existing,
			origin: {
				input: manualDraft,
				kind: "manual",
				source: {
					contentHash: "manual-hash",
					mtime: 2,
					path: "Notes/Manual.md",
					size: 20,
				},
			},
		});

		assert.equal(manualPrepared.status, "ready");
		assert.equal(manualStorage.data.manualConceptDraft?.title, "Shared title");
		assert.equal(manualVault.modifyCount, 0);
		if (manualPrepared.status !== "ready") throw new Error(manualPrepared.message);

		assert.deepEqual(await manualService.execute(manualPrepared.plan), { status: "merged" });
		assert.equal(manualStorage.data.manualConceptDraft?.title, "");
		assert.notEqual(manualStorage.data.manualConceptDraftId, undefined);
		assert.equal(
			Object.values(manualStorage.data.conceptSourceLinks)[0]?.conceptId,
			existing.conceptId,
		);
		assert.deepEqual(
			manualStorage.data.sourceAnalysisRecords["Notes/Manual.md"]?.linkedConceptIds,
			[existing.conceptId],
		);
	}

	{
		const changedData = createDefaultPluginData();
		changedData.knowledgeProposals[proposal.id] = {
			...proposal,
			updatedAt: "2026-07-25T11:00:00.000Z",
		};
		const changedService = new IncomingConceptMergeService(
			new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) }),
			new MemoryIncomingMergeStorage(changedData),
			() => now,
		);
		const changedResult = await changedService.prepare({
			draft: {
				coreMeaning: "Merged.",
				englishName: "",
				importance: "normal",
				learningMode: "reviewable",
				tags: [],
				title: "Shared title",
				whyItMatters: "",
			},
			existing,
			origin: {
				kind: "inbox",
				proposalId: proposal.id,
				proposalUpdatedAt: proposal.updatedAt,
			},
		});

		assert.equal(changedResult.status, "blocked");
		if (changedResult.status === "blocked") {
			assert.match(changedResult.message, /Proposal changed/);
		}
	}

	{
		const rollbackData = createDefaultPluginData();
		rollbackData.knowledgeProposals[proposal.id] = proposal;
		const rollbackVault = new MemoryIncomingMergeVault({
			[existing.path]: conceptMarkdown(existing),
		});
		const rollbackStorage = new MemoryIncomingMergeStorage(rollbackData);
		const rollbackService = new IncomingConceptMergeService(
			rollbackVault,
			rollbackStorage,
			() => now,
		);
		const rollbackPrepared = await rollbackService.prepare({
			draft: {
				coreMeaning: "Merged.",
				englishName: "",
				importance: "normal",
				learningMode: "reviewable",
				tags: [],
				title: "Shared title",
				whyItMatters: "",
			},
			existing,
			origin: {
				kind: "inbox",
				proposalId: proposal.id,
				proposalUpdatedAt: proposal.updatedAt,
			},
		});
		assert.equal(rollbackPrepared.status, "ready");
		if (rollbackPrepared.status !== "ready") throw new Error(rollbackPrepared.message);
		rollbackStorage.partialFailOnce = true;
		const before = rollbackVault.files[existing.path];

		const rollbackResult = await rollbackService.execute(rollbackPrepared.plan);

		assert.equal(rollbackResult.status, "failed");
		assert.equal(rollbackVault.files[existing.path], before);
		assert.equal(rollbackStorage.data.knowledgeProposals[proposal.id]?.status, "edited");
	}

	{
		const rollbackData = createDefaultPluginData();
		rollbackData.knowledgeProposals[proposal.id] = proposal;
		const rollbackVault = new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) });
		const rollbackStorage = new MemoryIncomingMergeStorage(rollbackData);
		const rollbackService = new IncomingConceptMergeService(rollbackVault, rollbackStorage, () => now);
		const rollbackPrepared = await rollbackService.prepare({
			draft: {
				coreMeaning: "Merged.", englishName: "", importance: "normal", learningMode: "reviewable",
				tags: [], title: "Shared title", whyItMatters: "",
			},
			existing,
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(rollbackPrepared.status, "ready");
		if (rollbackPrepared.status !== "ready") throw new Error(rollbackPrepared.message);
		rollbackStorage.partialFailOnce = true;
		rollbackVault.rollbackRace = true;

		const rollbackResult = await rollbackService.execute(rollbackPrepared.plan);

		assert.equal(rollbackResult.status, "failed");
		assert.match(rollbackVault.files[existing.path] ?? "", /Merged\./);
		assert.match(rollbackVault.files[existing.path] ?? "", /Edit made during rollback/);
	}

	{
		const faultData = structuredClone(completeDataFixture);
		const faultVault = new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) });
		const faultStorage = new MemoryIncomingMergeStorage(faultData);
		const faultService = new IncomingConceptMergeService(faultVault, faultStorage, () => now);
		const prepared = await faultService.prepare({
			draft: {
				coreMeaning: "Merged.",
				englishName: "",
				importance: "normal",
				learningMode: "reviewable",
				tags: [],
				title: "Shared title",
				whyItMatters: "",
			},
			existing,
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const filesBefore = { ...faultVault.files };
		const dataBefore = structuredClone(faultStorage.data);
		faultVault.throwAfterProcessOnce = true;
		const result = await faultService.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.deepEqual(faultVault.files, filesBefore);
		assert.deepEqual(faultStorage.data, dataBefore);
		assert.equal(faultStorage.saveCount, 0);
	}

	{
		const raceData = structuredClone(completeDataFixture);
		const raceVault = new MemoryIncomingMergeVault({ [existing.path]: conceptMarkdown(existing) });
		const raceStorage = new MemoryIncomingMergeStorage(raceData);
		const raceService = new IncomingConceptMergeService(raceVault, raceStorage, () => now);
		const prepared = await raceService.prepare({
			draft: {
				coreMeaning: "Merged.",
				englishName: "",
				importance: "normal",
				learningMode: "reviewable",
				tags: [],
				title: "Shared title",
				whyItMatters: "",
			},
			existing,
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		raceVault.throwAfterProcessOnce = true;
		raceVault.throwAfterProcessRaceEdit = "\nLearner edit during rollback\n";
		const result = await raceService.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.match(result.message, /Rollback also failed/i);
		assert.equal(raceVault.files[existing.path], `${prepared.plan.after}\nLearner edit during rollback\n`);
		assert.deepEqual(raceStorage.data, completeDataFixture);
		assert.equal(raceStorage.saveCount, 0);
	}
}

class MemoryIncomingMergeVault implements IncomingConceptMergeVault {
	modifyCount = 0;
	throwAfterProcessOnce = false;
	throwAfterProcessRaceEdit?: string;
	racePath?: string;
	raceEdit?: string;
	rollbackRace = false;

	constructor(public files: Record<string, string>) {
	}

	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		if (this.rollbackRace && this.modifyCount > 0) {
			this.rollbackRace = false;
			this.files[path] += "\nEdit made during rollback\n";
		}
		if (this.racePath === path && this.raceEdit) {
			this.files[path] += this.raceEdit;
			this.racePath = undefined;
			this.raceEdit = undefined;
		}
		const current = this.files[path];
		if (current === undefined) throw new Error(`Missing file: ${path}`);
		const next = transform(current);
		this.files[path] = next;
		this.modifyCount += 1;
		if (this.throwAfterProcessOnce) {
			this.throwAfterProcessOnce = false;
			if (this.throwAfterProcessRaceEdit) this.files[path] += this.throwAfterProcessRaceEdit;
			throw new Error("Injected after-process failure");
		}
	}
}

class MemoryIncomingMergeStorage implements IncomingConceptMergeStorage {
	partialFailOnce = false;
	saveCount = 0;

	constructor(public data: MnemePluginData) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.data = data;
		if (this.partialFailOnce) {
			this.partialFailOnce = false;
			throw new Error("Partial storage write failed");
		}
		this.saveCount += 1;
	}
}

function conceptMarkdown(concept: ConceptSummary): string {
	return [
		"---",
		"mneme_type: concept",
		`mneme_id: ${concept.conceptId}`,
		`mneme_title: "${concept.title}"`,
		"mneme_version: 1",
		`cards: \"[[Mneme/Cards/Existing/Cards|${concept.title} Cards]]\"`,
		"learning_mode: reviewable",
		"importance: normal",
		"tags: [existing]",
		"---",
		`# ${concept.title}`,
		"",
		"## Core Meaning",
		"",
		concept.coreMeaning ?? "",
		"",
		"## Why It Matters",
		"",
		concept.whyItMatters ?? "",
		"",
		"## Review Cards",
		"",
		`Cards: [[Mneme/Cards/Existing/Cards|${concept.title} Cards]]`,
		"",
	].join("\n");
}

export const done = runAsyncTests();
