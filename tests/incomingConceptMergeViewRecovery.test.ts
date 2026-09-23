import assert from "node:assert/strict";
import MnemePlugin from "../src/main";
import { MnemeConceptConflictMergeView, type ConceptConflictMergeSession } from "../src/views/conceptConflictMergeView";
import type { IncomingConceptMergeReceipt } from "../src/services/incomingConceptMergeRecovery";
import type { ConceptMergeDraft } from "../src/services/conceptMergeDraft";

const receipt: IncomingConceptMergeReceipt = {
	version: 1, status: "written", operationId: "operation-1", conceptId: "concept-1", path: "Concepts/One.md",
	beforeHash: "a".repeat(64), afterHash: "b".repeat(64), createdAt: "2026-09-23T10:00:00Z",
	origin: { kind: "inbox", proposalId: "proposal-1", inputHash: "c".repeat(64) },
};
const draft: ConceptMergeDraft = {
	title: "One", coreMeaning: "Meaning", whyItMatters: "Why", englishName: "", importance: "normal", learningMode: "reviewable", tags: [],
};
type ViewState = {
	completed: boolean;
	isClosed: boolean;
	sessionRevision: number;
	session: ConceptConflictMergeSession;
	draft: ConceptMergeDraft;
	saveQueue: Promise<void>;
	saveTimer?: number;
	contentEl: { empty(): void; createEl(tag: string, options: { text: string }): void };
	actions: { draftStore: { saveDraft(record: unknown): Promise<void> } };
	persistDraft(): Promise<void>;
	completeRecoveredMerge(receipt: IncomingConceptMergeReceipt): void;
};

function makeView(): { view: ViewState; rendered: string[]; saves: unknown[] } {
	const view = Object.create(MnemeConceptConflictMergeView.prototype) as ViewState;
	const rendered: string[] = [];
	const saves: unknown[] = [];
	view.completed = false;
	view.isClosed = false;
	view.sessionRevision = 1;
	view.draft = draft;
	view.saveQueue = Promise.resolve();
	view.session = {
		existing: { conceptId: receipt.conceptId, path: receipt.path, title: "One" },
		incoming: { conceptId: "incoming", path: "", title: "One" },
		incomingFingerprint: "fingerprint", incomingMarkdown: "", key: "inbox:proposal-1", onReturn() {},
		origin: { kind: "inbox", proposalId: "proposal-1", proposalUpdatedAt: receipt.createdAt },
	};
	view.contentEl = { empty() { rendered.length = 0; }, createEl(_tag, options) { rendered.push(options.text); } };
	view.actions = { draftStore: { async saveDraft(record) { saves.push(record); } } };
	return { view, rendered, saves };
}

async function run(): Promise<void> {
	for (const mismatch of [
		{ ...receipt, status: "pending" as const },
		{ ...receipt, conceptId: "other" },
		{ ...receipt, path: "Concepts/Other.md" },
		{ ...receipt, origin: { kind: "inbox" as const, proposalId: "other", inputHash: "c".repeat(64) } },
	]) {
		const { view, rendered } = makeView();
		view.completeRecoveredMerge(mismatch);
		assert.equal(view.completed, false);
		assert.deepEqual(rendered, []);
	}
	{
		const { view, rendered, saves } = makeView();
		let release!: () => void;
		view.saveQueue = new Promise<void>((resolve) => { release = resolve; });
		const pendingSave = view.persistDraft();
		view.completeRecoveredMerge(receipt);
		assert.equal(view.completed, true);
		assert.equal(view.sessionRevision, 2, "old async work must lose its session revision");
		assert.equal(rendered[0], "Merge Complete");
		release();
		await pendingSave;
		await view.persistDraft();
		assert.deepEqual(saves, [], "recovered sessions must not recreate consumed Merge drafts");
	}
	{
		const { view } = makeView();
		view.session.origin = { kind: "manual", input: { ...draft, draftId: "manual-new" } };
		const manual: IncomingConceptMergeReceipt = { ...receipt, origin: { kind: "manual", draftId: "manual-old", inputHash: "c".repeat(64) } };
		view.completeRecoveredMerge(manual);
		assert.equal(view.completed, false, "a newer Composer session must survive an old completion");
		view.session.origin.input.draftId = "manual-old";
		view.completeRecoveredMerge(manual);
		assert.equal(view.completed, true);
	}
	{
		const { view } = makeView();
		const refreshed: string[] = [];
		const plugin = {
			incomingConceptMergeService: { async resume() { return { status: "merged", receipt }; } },
			app: { workspace: { getLeavesOfType: () => [{ view }] } },
			reviewStateStore: { async load() { refreshed.push("state"); } },
			async refreshOpenConceptLibraryViews() { refreshed.push("library"); },
			async refreshOpenInboxViews() { refreshed.push("inbox"); },
			async refreshReviewViews() { refreshed.push("review"); },
		};
		const resume = (MnemePlugin.prototype as unknown as { resumeIncomingConceptMerge(): Promise<void> }).resumeIncomingConceptMerge;
		await resume.call(plugin);
		assert.equal(view.completed, true, "the command must notify the matching open Merge workspace");
		assert.deepEqual(refreshed, ["state", "library", "inbox", "review"]);
	}
}

export const done = run();
