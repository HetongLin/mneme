import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	ConceptConflictMergeDraftStore,
} from "../src/services/conceptConflictMergeDraftStore";
import {
	createDefaultPluginData,
	normalizePluginData,
} from "../src/services/reviewStateStore";

async function runAsyncTests(): Promise<void> {
	const storage = new MemoryStorage(createDefaultPluginData());
	const store = new ConceptConflictMergeDraftStore(storage);
	const record = {
		draft: {
			coreMeaning: "Merged meaning.",
			englishName: "",
			importance: "normal" as const,
			learningMode: "reviewable" as const,
			tags: ["merge"],
			title: "Merged title",
			whyItMatters: "Merged value.",
		},
		existingConceptId: "concept-existing",
		incomingFingerprint: "fingerprint-1",
		key: "inbox:proposal-1",
		updatedAt: "2026-07-25T10:00:00.000Z",
	};

	await store.saveDraft(record);

	assert.deepEqual(await store.getDraft(record.key), record);
	assert.deepEqual(
		normalizePluginData(storage.data).conceptConflictMergeDrafts[record.key],
		record,
	);

	await store.clearDraft(record.key);

	assert.equal(await store.getDraft(record.key), undefined);
}

class MemoryStorage {
	constructor(public data: MnemePluginData) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.data = data;
	}
}

void runAsyncTests().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
