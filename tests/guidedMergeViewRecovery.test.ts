import assert from "node:assert/strict";
import MnemePlugin from "../src/main";
import { MnemeConceptMergeView } from "../src/views/conceptMergeView";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { GuidedConceptMergeReceipt } from "../src/services/guidedConceptMergeRecovery";

const receipt: GuidedConceptMergeReceipt = {
	version: 1, status: "written", operationId: "operation", createdAt: "2026-09-24T00:00:00Z",
	survivor: { conceptId: "a", path: "A.md" }, merged: { conceptId: "b", path: "B.md" },
	protectedPaths: ["A.md", "B.md"], cardIds: [], writes: ["A.md", "B.md"].map((path) => ({ path, beforeHash: "a".repeat(64), afterHash: "b".repeat(64) })),
	journalHash: "c".repeat(64), sourceLinksHash: "d".repeat(64),
};
type ViewState = {
	completed: boolean; isClosed: boolean; isWorking: boolean; operationRevision: number; draft?: unknown;
	firstConceptId: string; secondConceptId: string; concepts: ConceptSummary[];
	renderSuccess(concept: ConceptSummary): void;
	completeRecoveredMerge(receipt: GuidedConceptMergeReceipt): void;
};
function makeView() {
	const view = Object.create(MnemeConceptMergeView.prototype) as ViewState;
	Object.assign(view, { completed: false, isClosed: false, isWorking: true, operationRevision: 1, draft: {}, firstConceptId: "b", secondConceptId: "a",
		concepts: [{ ...receipt.survivor, title: "Alpha" }, { ...receipt.merged, title: "Beta" }] });
	const rendered: ConceptSummary[] = [];
	view.renderSuccess = (concept) => rendered.push(concept);
	return { view, rendered };
}
async function run(): Promise<void> {
	for (const mismatch of [
		{ ...receipt, status: "pending" as const },
		{ ...receipt, survivor: { ...receipt.survivor, conceptId: "other" } },
		{ ...receipt, survivor: { ...receipt.survivor, path: "Other.md" } },
		{ ...receipt, merged: { ...receipt.merged, path: "Other.md" } },
	]) {
		const { view, rendered } = makeView();
		view.completeRecoveredMerge(mismatch);
		assert.equal(view.completed, false);
		assert.deepEqual(rendered, []);
	}
	{
		const { view, rendered } = makeView();
		view.isClosed = true;
		view.completeRecoveredMerge(receipt);
		assert.deepEqual(rendered, []);
	}
	{
		const { view, rendered } = makeView();
		view.completeRecoveredMerge(receipt);
		assert.equal(view.completed, true);
		assert.equal(view.draft, undefined);
		assert.equal(view.isWorking, false);
		assert.equal(view.operationRevision, 2, "invalidate earlier asynchronous UI work");
		assert.equal(rendered[0]?.conceptId, "a");
	}
	{
		const { view } = makeView();
		const refreshed: string[] = [];
		const plugin = {
			guidedConceptMergeService: { async resume() { return { status: "merged", receipt }; } },
			app: { workspace: { getLeavesOfType: () => [{ view }] } },
			reviewStateStore: { async load() { refreshed.push("state"); } },
			async refreshOpenConceptLibraryViews() { refreshed.push("library"); },
			async refreshOpenInboxViews() { refreshed.push("inbox"); },
			async refreshReviewViews() { refreshed.push("review"); },
		};
		await (MnemePlugin.prototype as unknown as { resumeGuidedMerge(): Promise<void> }).resumeGuidedMerge.call(plugin);
		assert.equal(view.completed, true);
		assert.deepEqual(refreshed, ["state", "library", "inbox", "review"]);
	}
}
export const done = run();
