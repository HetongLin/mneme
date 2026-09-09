import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { ConceptConflictMergeDraftRecord } from "../src/models/conceptConflictMergeDraft";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { ConceptConflictMergeDraftStore } from "../src/services/conceptConflictMergeDraftStore";
import { MnemeConceptConflictMergeView, type ConceptConflictMergeSession } from "../src/views/conceptConflictMergeView";

class Storage {
	data = createDefaultPluginData();
	saves = 0;
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: typeof this.data): Promise<void> { this.saves += 1; this.data = structuredClone(data); }
}

const existing: ConceptSummary = {
	conceptId: "existing-id", path: "Concepts/Existing.md", title: "Existing",
	coreMeaning: "Existing meaning", whyItMatters: "Existing why", tags: ["existing"],
	importance: "normal", learningMode: "reviewable",
};
const incoming: ConceptSummary = {
	conceptId: "incoming-id", path: "Concepts/Incoming.md", title: "Incoming",
	coreMeaning: "Incoming meaning", whyItMatters: "Incoming why", tags: ["incoming"],
	importance: "high", learningMode: "exploratory",
};
const draft: ConceptConflictMergeDraftRecord["draft"] = {
	title: "Hand written title", englishName: "Handwritten",
	coreMeaning: "Hand written meaning", whyItMatters: "Hand written why",
	importance: "critical", learningMode: "reviewable", tags: ["kept", "exact"],
};

function session(): ConceptConflictMergeSession {
	return {
		existing, incoming, incomingFingerprint: "fingerprint-a", incomingMarkdown: "# Incoming",
		key: "merge-key", onReturn: () => undefined,
		origin: { kind: "inbox", proposalId: "proposal-a", proposalUpdatedAt: "2026-09-10T00:00:00.000Z" },
	};
}

interface Harness {
	actions: { draftStore: ConceptConflictMergeDraftStore };
	draft?: typeof draft;
	session?: ConceptConflictMergeSession;
	statusMessage?: string;
	saveQueue: Promise<void>;
	render(): void;
	setSession: MnemeConceptConflictMergeView["setSession"];
}

function createHarness(storage: Storage): Harness {
	const draftStore = new ConceptConflictMergeDraftStore(storage);
	const view = Object.create(MnemeConceptConflictMergeView.prototype) as Harness;
	view.actions = { draftStore };
	view.saveQueue = Promise.resolve();
	view.render = () => undefined;
	return view;
}

async function run(): Promise<void> {
	for (const variant of ["existing", "fingerprint", "both", "same"] as const) {
		const storage = new Storage();
		const stored: ConceptConflictMergeDraftRecord = {
			key: "merge-key",
			existingConceptId: variant === "existing" || variant === "both" ? "other-id" : existing.conceptId,
			incomingFingerprint: variant === "fingerprint" || variant === "both" ? "fingerprint-b" : "fingerprint-a",
			draft, updatedAt: "2026-09-10T00:00:00.000Z",
		};
		storage.data.conceptConflictMergeDrafts[stored.key] = stored;
		const before = structuredClone(storage.data);
		const view = createHarness(storage);
		const currentSession = session();
		await view.setSession(currentSession);
		assert.deepEqual(view.draft, draft);
		assert.deepEqual(storage.data, before);
		assert.equal(storage.saves, 0);
		assert.equal(view.session, currentSession);
		assert.notEqual(view.draft, stored.draft);
		assert.notEqual(view.draft?.tags, stored.draft.tags);
		assert.equal(view.statusMessage, variant === "same" ? "Saved Merge draft restored. No vault content has changed." : "Saved Merge draft came from a different Concept or incoming revision. Its text was kept. Review every field against the current Concepts before confirming.");
	}

	{
		const storage = new Storage();
		const view = createHarness(storage);
		await view.setSession(session());
		assert.ok(view.draft);
		assert.equal(storage.saves, 1);
		assert.deepEqual((await new ConceptConflictMergeDraftStore(storage).getDraft("merge-key"))?.draft, view.draft);
	}
	console.log("Concept conflict Merge draft restore tests passed.");
}

export const done = run();
