import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	IncomingConceptMergeService,
	type IncomingConceptMergeStorage,
	type IncomingConceptMergeVault,
} from "../src/services/incomingConceptMergeService";
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
		assert.equal(manualStorage.data.manualConceptDraft, undefined);
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
		const before = rollbackVault.files[existing.path];
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

		const rollbackResult = await rollbackService.execute(rollbackPrepared.plan);

		assert.equal(rollbackResult.status, "failed");
		assert.equal(rollbackVault.files[existing.path], before);
		assert.equal(rollbackStorage.data.knowledgeProposals[proposal.id]?.status, "edited");
	}
}

class MemoryIncomingMergeVault implements IncomingConceptMergeVault {
	modifyCount = 0;

	constructor(public files: Record<string, string>) {
	}

	async modify(path: string, content: string): Promise<void> {
		if (this.files[path] === undefined) throw new Error(`Missing file: ${path}`);
		this.files[path] = content;
		this.modifyCount += 1;
	}

	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
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

void runAsyncTests().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
