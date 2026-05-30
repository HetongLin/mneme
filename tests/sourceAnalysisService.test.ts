import assert from "node:assert/strict";
import { SourceAnalysisRecord } from "../src/models/sourceAnalysis";
import { SourceAnalysisService } from "../src/services/sourceAnalysisService";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { computeContentHash } from "../src/utils/sourceHash";
import { MemorySourceAnalysisStorage, createPluginData, createRecord } from "./sourceAnalysisTestUtils";

async function runAsyncTests(): Promise<void> {
	{
		const storage = new MemorySourceAnalysisStorage(createPluginData());
		const contentReader = new CountingContentReader({
			"Notes/Intro.md": "Concept source content",
		});
		const service = new SourceAnalysisService(
			new SourceAnalysisStore(storage),
			(path) => contentReader.read(path),
			() => "2026-01-02T12:00:00.000Z",
		);

		const result = await service.analyzeSource({
			mtime: 100,
			path: "Notes/Intro.md",
			size: 22,
		});

		assert.equal(result.status, "analyzed");
		assert.equal(contentReader.readCount, 1);
		assert.equal(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"].status, "clean");
		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"].pendingProposalIds, []);
	}

	{
		const previous = createRecord("Notes/Intro.md", {
			mtime: 100,
			size: 22,
		});
		const storage = new MemorySourceAnalysisStorage(createPluginData({
			[previous.sourcePath]: previous,
		}));
		const contentReader = new CountingContentReader({
			"Notes/Intro.md": "This should not be read",
		});
		const service = new SourceAnalysisService(new SourceAnalysisStore(storage), (path) => contentReader.read(path));

		const result = await service.analyzeSource({
			mtime: previous.mtime,
			path: previous.sourcePath,
			size: previous.size,
		});

		assert.equal(result.status, "skipped_metadata_unchanged");
		assert.equal(contentReader.readCount, 0);
		assert.equal(storage.savedData, undefined);
	}

	{
		const content = "Same content";
		const previous = createRecord("Notes/Intro.md", {
			contentHash: await computeContentHash(content),
			mtime: 100,
			size: 10,
		});
		const storage = new MemorySourceAnalysisStorage(createPluginData({
			[previous.sourcePath]: previous,
		}));
		const contentReader = new CountingContentReader({
			"Notes/Intro.md": content,
		});
		const service = new SourceAnalysisService(
			new SourceAnalysisStore(storage),
			(path) => contentReader.read(path),
			() => "2026-01-02T12:00:00.000Z",
		);

		const result = await service.analyzeSource({
			mtime: 200,
			path: previous.sourcePath,
			size: 12,
		});

		assert.equal(result.status, "skipped_hash_unchanged");
		assert.equal(contentReader.readCount, 1);
		assert.equal(storage.savedData?.sourceAnalysisRecords[previous.sourcePath].status, "clean");
		assert.equal(storage.savedData?.sourceAnalysisRecords[previous.sourcePath].mtime, 200);
		assert.equal(storage.savedData?.sourceAnalysisRecords[previous.sourcePath].size, 12);
	}

	{
		const previous = createRecord("Notes/Intro.md", {
			contentHash: await computeContentHash("Old content"),
			linkedConceptIds: ["concept-a", "concept-b"],
			pendingProposalIds: ["proposal-a"],
		});
		const storage = new MemorySourceAnalysisStorage(createPluginData({
			[previous.sourcePath]: previous,
		}));
		const contentReader = new CountingContentReader({
			"Notes/Intro.md": "Changed content",
		});
		const service = new SourceAnalysisService(
			new SourceAnalysisStore(storage),
			(path) => contentReader.read(path),
			() => "2026-01-03T12:00:00.000Z",
		);

		const result = await service.analyzeSource({
			mtime: 300,
			path: previous.sourcePath,
			size: 15,
		});
		const savedRecord = storage.savedData?.sourceAnalysisRecords[previous.sourcePath];

		assert.equal(result.status, "analyzed");
		assert.equal(savedRecord?.status, "stale");
		assert.deepEqual(savedRecord?.linkedConceptIds, ["concept-a", "concept-b"]);
		assert.deepEqual(savedRecord?.pendingProposalIds, ["proposal-a"]);
		assert.notEqual(savedRecord?.contentHash, previous.contentHash);
	}
}

class CountingContentReader {
	readCount = 0;

	constructor(private readonly contentByPath: Record<string, string>) {
	}

	async read(path: string): Promise<string> {
		this.readCount += 1;

		if (!(path in this.contentByPath)) {
			throw new Error(`No content for ${path}`);
		}

		return this.contentByPath[path];
	}
}

export const done = runAsyncTests();
