import assert from "node:assert/strict";
import { SourceAnalysisRecord } from "../src/models/sourceAnalysis";
import { shouldAnalyzeSource } from "../src/services/sourceAnalysisDecision";

const previous = createRecord();

{
	const decision = shouldAnalyzeSource(undefined, {
		mtime: 1,
		path: "Notes/Intro.md",
		size: 100,
	});

	assert.equal(decision.type, "analyze");
	assert.equal(decision.shouldAnalyze, true);
}

{
	const decision = shouldAnalyzeSource(previous, {
		mtime: previous.mtime,
		path: previous.sourcePath,
		size: previous.size,
	});

	assert.equal(decision.type, "skip_metadata_unchanged");
	assert.equal(decision.shouldAnalyze, false);
	assert.equal(decision.shouldReadContent, false);
}

{
	const decision = shouldAnalyzeSource(previous, {
		mtime: previous.mtime + 1,
		path: previous.sourcePath,
		size: previous.size,
	});

	assert.equal(decision.type, "missing_hash_requires_read");
	assert.equal(decision.shouldAnalyze, false);
	assert.equal(decision.shouldReadContent, true);
}

{
	const decision = shouldAnalyzeSource(previous, {
		mtime: previous.mtime + 1,
		path: previous.sourcePath,
		size: previous.size + 1,
	}, previous.contentHash);

	assert.equal(decision.type, "skip_hash_unchanged");
	assert.equal(decision.shouldAnalyze, false);
}

{
	const decision = shouldAnalyzeSource(previous, {
		mtime: previous.mtime + 1,
		path: previous.sourcePath,
		size: previous.size + 1,
	}, "different-hash");

	assert.equal(decision.type, "stale_hash_changed");
	assert.equal(decision.shouldAnalyze, true);
}

function createRecord(): SourceAnalysisRecord {
	return {
		contentHash: "abc123",
		lastAnalyzedAt: "2026-01-01T12:00:00.000Z",
		linkedConceptIds: ["concept-a"],
		mtime: 100,
		pendingProposalIds: [],
		size: 200,
		sourcePath: "Notes/Intro.md",
		status: "clean",
	};
}
