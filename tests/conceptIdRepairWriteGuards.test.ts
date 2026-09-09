import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import type { PluginDataStorage } from "../src/services/pluginDataMutation";
import { createEmptyManualConceptDraft } from "../src/models/manualConceptDraft";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createDefaultPluginData, normalizePluginData } from "../src/services/reviewStateStore";
import { createManualConceptWithRecovery } from "../src/services/manualConceptWriteService";
import type { ManualConceptVault } from "../src/services/manualConceptService";

class Storage implements PluginDataStorage {
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> { this.data = structuredClone(data); }
}
class Vault implements ManualConceptVault {
	files = new Map<string, string>();
	async create(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async createFolder(_path: string): Promise<void> {}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async read(path: string): Promise<string> { return this.files.get(path) ?? ""; }
}

const conceptPath = "Mneme/Concepts/Guard.md";
const cardsPath = "Mneme/Cards/Guard/Cards.md";
const repair = (status: "pending" | "completed", newConceptId: string) => ({
	version: 1 as const, status, oldConceptId: "old-concept-001", newConceptId,
	concept: { path: conceptPath, beforeHash: "a".repeat(64), afterHash: "b".repeat(64) },
	cards: { path: cardsPath, beforeHash: "c".repeat(64), afterHash: "d".repeat(64) },
	migrateState: false, createdAt: "2026-09-09T00:00:00.000Z",
});

async function run(): Promise<void> {
	const draft = {
		...createEmptyManualConceptDraft(undefined, "2026-09-09T00:00:00.000Z"),
		title: "Guard", coreMeaning: "A concept protected by repair state.",
	};
	for (const status of ["pending", "completed"] as const) {
		const data = createDefaultPluginData();
		data.manualConceptDraft = draft;
		data.manualConceptDraftId = draft.draftId;
		data.conceptIdRepairs = { "repair-concept-001": repair(status, "repair-concept-001") };
		const storage = new Storage(normalizePluginData(data));
		const vault = new Vault();
		let calls = 0;
		const result = await createManualConceptWithRecovery(draft, DEFAULT_SETTINGS, vault, storage, {
			createId: () => (++calls === 1 ? "repair-concept-001" : "fresh-concept-001"),
		});
		if (status === "pending") {
			assert.notEqual(result.path, conceptPath);
			assert.ok(calls >= 2);
		} else {
			assert.equal(result.conceptId, "fresh-concept-001");
			assert.ok(calls >= 2);
		}
	}
}

export const done = run().then(() => console.log("Concept ID repair write guard tests passed."));
