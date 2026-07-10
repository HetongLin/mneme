import assert from "node:assert/strict";
import { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { SourceAnalysisRecord } from "../src/models/sourceAnalysis";
import { SourceAnalysisStorage, SourceAnalysisStore } from "../src/services/sourceAnalysisStore";

async function runAsyncTests(): Promise<void> {
	{
		const storage = new MemorySourceAnalysisStorage({
			conceptSourceLinks: {
				"link-a": {
					addedAt: "2026-01-01T12:00:00.000Z",
					conceptId: "concept-a",
					evidence: [],
					id: "link-a",
					lastSeenAt: "2026-01-01T12:00:00.000Z",
					relationType: "origin",
					sourceHash: "hash-a",
					sourcePath: "Notes/Intro.md",
					status: "approved",
				},
			},
			knowledgeProposals: {
				"proposal-a": {
					createdAt: "2026-01-01T12:00:00.000Z",
					id: "proposal-a",
					kind: "new_concept",
					status: "suggested",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			reviewStates: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					createdAt: "2026-01-01T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 1,
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			schemaVersion: 1,
			settings: {
				...DEFAULT_SETTINGS,
				fsrsRequestRetention: 0.85,
			},
		});
		const store = new SourceAnalysisStore(storage);
		const record = createRecord("Notes/Intro.md");

		await store.upsertRecord(record);

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"], record);
		assert.equal(typeof storage.savedData?.knowledgeProposals["proposal-a"], "object");
		assert.equal(typeof storage.savedData?.conceptSourceLinks["link-a"], "object");
		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
	}

	{
		const storage = new MemorySourceAnalysisStorage(undefined);
		const store = new SourceAnalysisStore(storage);

		assert.deepEqual(await store.loadRecords(), {});
	}

	{
		const firstRecord = createRecord("Notes/Intro.md");
		const secondRecord = {
			...createRecord("Notes/Advanced.md"),
			lastCardGenerationHash: "concept-card-generation-hash",
		};
		const storage = new MemorySourceAnalysisStorage({
			reviewStates: {},
			schemaVersion: 1,
			settings: DEFAULT_SETTINGS,
			sourceAnalysisRecords: {
				[firstRecord.sourcePath]: firstRecord,
				[secondRecord.sourcePath]: secondRecord,
			},
		});
		const store = new SourceAnalysisStore(storage);

		assert.deepEqual(await store.getRecord(firstRecord.sourcePath), firstRecord);
		assert.deepEqual(new Set((await store.listRecords()).map((record) => record.sourcePath)), new Set([
			"Notes/Intro.md",
			"Notes/Advanced.md",
		]));
		assert.equal((await store.getRecord(secondRecord.sourcePath))?.lastCardGenerationHash, "concept-card-generation-hash");
	}

	{
		const record = createRecord("Notes/Intro.md");
		const storage = new MemorySourceAnalysisStorage({
			reviewStates: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					createdAt: "2026-01-01T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 1,
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			schemaVersion: 1,
			settings: {
				...DEFAULT_SETTINGS,
				fsrsEnableFuzz: true,
			},
			sourceAnalysisRecords: {
				[record.sourcePath]: record,
			},
		});
		const store = new SourceAnalysisStore(storage);

		await store.clearRecords();

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords, {});
		assert.equal(storage.savedData?.settings.fsrsEnableFuzz, true);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
	}
}

class MemorySourceAnalysisStorage implements SourceAnalysisStorage {
	savedData?: MnemePluginData;

	constructor(private data: unknown) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.savedData = data;
		this.data = data;
	}
}

function createRecord(sourcePath: string): SourceAnalysisRecord {
	return {
		contentHash: `${sourcePath}-hash`,
		lastAnalyzedAt: "2026-01-01T12:00:00.000Z",
		linkedConceptIds: ["concept-a"],
		mtime: 100,
		pendingProposalIds: ["proposal-a"],
		size: 200,
		sourcePath,
		status: "clean",
	};
}

export const done = runAsyncTests();
