import assert from "node:assert/strict";
import MnemePlugin from "../src/main";
import type { ConceptConflictMergeSession } from "../src/views/conceptConflictMergeView";
import type { ManualConceptDraft } from "../src/models/manualConceptDraft";
import type { ManualConceptSourceSnapshot } from "../src/services/manualConceptProvenanceService";

const baseDraft: ManualConceptDraft = {
	coreMeaning: "Meaning",
	draftId: "draft-a",
	englishName: "Meaning",
	importance: "normal",
	learningMode: "reviewable",
	sourcePath: "Sources/origin.md",
	tags: ["tag"],
	title: "Concept",
	updatedAt: "2026-09-24T10:00:00.000Z",
	whyItMatters: "Why",
};

const source: ManualConceptSourceSnapshot = {
	contentHash: "a".repeat(64),
	mtime: 1,
	path: "Sources/origin.md",
	size: 10,
};

async function open(
	draft: ManualConceptDraft = baseDraft,
	existingConceptId = "existing",
	snapshot: ManualConceptSourceSnapshot = source,
): Promise<ConceptConflictMergeSession> {
	let captured: ConceptConflictMergeSession | undefined;
	const plugin = {
		manualConceptDraftStore: { async getState() { return { draft, pendingWrite: undefined }; } },
		settings: { suggestEnglishAliases: true },
		async readManualConceptSourceSnapshot() { return snapshot; },
		async openConceptConflictMergeView(session: ConceptConflictMergeSession) { captured = session; },
	} as unknown as MnemePlugin;
	const method = (MnemePlugin.prototype as unknown as {
		openManualConflictMerge(existing: { conceptId: string; path: string; title: string }, draft: ManualConceptDraft, onReturn: () => Promise<void>): Promise<void>;
	}).openManualConflictMerge;
	await method.call(plugin, { conceptId: existingConceptId, path: "Concept.md", title: "Existing" }, draft, async () => {});
	assert.ok(captured);
	return captured;
}

async function run(): Promise<void> {
	const first = await open();
	const updatedDraft = { ...baseDraft, updatedAt: "2026-09-24T11:00:00.000Z" };
	const updated = await open(updatedDraft);
	assert.equal(updated.incomingFingerprint, first.incomingFingerprint, "autosave timestamps must not change the UI recovery fingerprint");
	assert.ok(updated.origin.kind === "manual");
	assert.strictEqual(updated.origin.input, updatedDraft, "the recovery origin must retain the exact Composer draft object");
	assert.deepEqual(updated.origin, { kind: "manual", input: updatedDraft, source });

	for (const changed of [
		{ ...baseDraft, title: "Changed" },
		{ ...baseDraft, englishName: "Changed" },
		{ ...baseDraft, coreMeaning: "Changed" },
		{ ...baseDraft, whyItMatters: "Changed" },
		{ ...baseDraft, importance: "high" as const },
		{ ...baseDraft, learningMode: "exploratory" as const },
		{ ...baseDraft, tags: ["other"] },
		{ ...baseDraft, sourcePath: "Sources/other.md" },
		{ ...baseDraft, draftId: "draft-b" },
	]) {
		assert.notEqual((await open(changed)).incomingFingerprint, first.incomingFingerprint);
	}
	assert.notEqual((await open({ ...baseDraft, sourcePath: undefined })).incomingFingerprint, first.incomingFingerprint);
	assert.notEqual((await open({ ...baseDraft, draftId: undefined })).incomingFingerprint, first.incomingFingerprint);
	assert.equal((await open({ ...baseDraft, title: " Concept ", coreMeaning: " Meaning " })).incomingFingerprint, first.incomingFingerprint, "draft identity follows normalized authored fields");
	assert.notEqual((await open(baseDraft, "other-existing")).incomingFingerprint, first.incomingFingerprint);

	const sourceChanged = await open(baseDraft, "existing", { ...source, contentHash: "b".repeat(64) });
	assert.notEqual(sourceChanged.incomingFingerprint, first.incomingFingerprint, "source content changes must change the UI recovery fingerprint");
}

export const done = run();
