import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { ManualCardDraftStore } from "../src/services/manualCardDraftStore";
import { ManualConceptDraftStore } from "../src/services/manualConceptDraftStore";
import { ConceptConflictMergeDraftStore } from "../src/services/conceptConflictMergeDraftStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { IncomingConceptMergeService } from "../src/services/incomingConceptMergeService";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";

class MemoryStorage {
	data = createDefaultPluginData();
	failNextSave = false;
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> {
		if (this.failNextSave) {
			this.failNextSave = false;
			throw new Error("Disk unavailable");
		}
		this.data = structuredClone(data);
	}
}

const proposal: KnowledgeProposal = {
	id: "proposal-concurrent", kind: "new_concept", status: "suggested",
	createdAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-09-05T10:00:00.000Z",
	payload: { title: "Concurrent updates", coreMeaning: "Each state update preserves others." },
};

async function run(): Promise<void> {
	{
		const storage = new MemoryStorage();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.load();
		await Promise.all([reviews.recordReview("card-a", "good"), reviews.recordReview("card-b", "hard")]);
		assert.deepEqual(Object.keys(storage.data.reviewStates).sort(), ["card-a", "card-b"]);
		assert.equal(Object.keys(storage.data.reviewEvents).length, 2);
	}
	{
		const storage = new MemoryStorage();
		const first = new ReviewStateStore(storage, new FsrsReviewScheduler());
		const second = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await Promise.all([first.load(), second.load()]);
		await Promise.all([first.recordReview("card-a", "good"), second.recordReview("card-a", "hard")]);
		assert.equal(storage.data.reviewStates["card-a"]?.reviewCount, 2);
		assert.equal(Object.keys(storage.data.reviewEvents).length, 2);
	}
	{
		const storage = new MemoryStorage();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		const proposals = new KnowledgeProposalStore(storage);
		await reviews.load();
		await Promise.all([reviews.recordReview("card-a", "good"), proposals.upsertProposal(proposal)]);
		assert.equal(storage.data.reviewStates["card-a"]?.reviewCount, 1);
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.payload?.title, "Concurrent updates");
	}
	{
		const storage = new MemoryStorage();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.load();
		storage.failNextSave = true;
		await assert.rejects(reviews.recordReview("card-a", "good"), /Disk unavailable/);
		assert.equal(storage.data.reviewStates["card-a"], undefined);
		await reviews.recordReview("card-b", "good");
		assert.equal(storage.data.reviewStates["card-b"]?.reviewCount, 1);
	}
	{
		const storage = new MemoryStorage();
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.load();
		const cardDraft = await new ManualCardDraftStore(storage).getDraft();
		const conceptDraft = await new ManualConceptDraftStore(storage).getDraft();
		await Promise.all([
			reviews.recordReview("card-a", "good"),
			runPluginDataMutation(storage, async () => {
				const data = await storage.loadData() as MnemePluginData;
				await storage.saveData({ ...data, settings: { ...DEFAULT_SETTINGS, fsrsEnabled: false } });
			}),
			new ManualCardDraftStore(storage).saveDraft({ draftId: cardDraft.draftId, front: "Front", back: "Back", rubric: "", cardType: "definition", updatedAt: proposal.createdAt }),
			new ManualConceptDraftStore(storage).saveDraft({ ...conceptDraft, title: "Draft", englishName: "", coreMeaning: "Meaning", whyItMatters: "", importance: "normal", learningMode: "reviewable", tags: [], updatedAt: proposal.createdAt }),
			new SourceAnalysisStore(storage).upsertRecord({ sourcePath: "Source.md", contentHash: "hash", mtime: 1, size: 10, lastAnalyzedAt: proposal.createdAt, status: "clean", linkedConceptIds: [], pendingProposalIds: [] }),
			new ConceptSourceLinkStore(storage).upsertLink({ id: "link-a", conceptId: "concept-a", sourcePath: "Source.md", sourceHash: "hash", relationType: "origin", status: "approved", evidence: [], addedAt: proposal.createdAt, lastSeenAt: proposal.createdAt }),
			new ConceptConflictMergeDraftStore(storage).saveDraft({ key: "manual", existingConceptId: "concept-a", incomingFingerprint: "fingerprint", updatedAt: proposal.createdAt, draft: { title: "Merge", englishName: "", coreMeaning: "Meaning", whyItMatters: "", importance: "normal", learningMode: "reviewable", tags: [] } }),
		]);
		assert.equal(storage.data.reviewStates["card-a"]?.reviewCount, 1);
		assert.equal(storage.data.settings.fsrsEnabled, false);
		assert.equal(storage.data.manualCardDraft?.front, "Front");
		assert.equal(storage.data.manualConceptDraft?.title, "Draft");
		assert.ok(storage.data.sourceAnalysisRecords["Source.md"]);
		assert.ok(storage.data.conceptSourceLinks["link-a"]);
		assert.ok(storage.data.conceptConflictMergeDrafts.manual);
		await Promise.all([
			new ManualCardDraftStore(storage).clearDraft(cardDraft.draftId!),
			new ManualConceptDraftStore(storage).clearDraft(conceptDraft.draftId!),
			new ConceptConflictMergeDraftStore(storage).clearDraft("manual"),
		]);
		assert.equal(storage.data.manualCardDraft, undefined);
		assert.equal(storage.data.manualConceptDraft, undefined);
		assert.deepEqual(storage.data.conceptConflictMergeDrafts, {});
		assert.equal(storage.data.reviewStates["card-a"]?.reviewCount, 1);
	}
	{
		const storage = new MemoryStorage();
		const proposals = new KnowledgeProposalStore(storage);
		await proposals.upsertProposal(proposal);
		await Promise.all([
			proposals.updateProposalStatus(proposal.id, "opened"),
			proposals.updateProposalStatus(proposal.id, "approved"),
		]);
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "approved");
		const outcomes = await Promise.allSettled([
			proposals.updateProposalStatus(proposal.id, "written"),
			proposals.updateProposalStatus(proposal.id, "stale"),
		]);
		assert.equal(outcomes[0]?.status, "fulfilled");
		assert.equal(outcomes[1]?.status, "rejected", "terminal state cannot be reopened by a stale concurrent transition");
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, "written");
	}
	for (const failCommit of [false, true]) {
		const storage = new MemoryStorage();
		storage.data.knowledgeProposals[proposal.id] = proposal;
		let markdown = "---\nmneme_type: concept\nmneme_id: concept-a\n---\n# Existing\n\n## Core Meaning\n\nExisting meaning.\n";
		const original = markdown;
		const written = deferred();
		const release = deferred();
		const vault = {
			read: async () => markdown,
			process: async (_path: string, transform: (content: string) => string) => {
				markdown = transform(markdown);
				if (markdown !== original) { written.resolve(); await release.promise; }
			},
		};
		const merges = new IncomingConceptMergeService(vault, storage);
		const prepared = await merges.prepare({
			existing: { path: "Existing.md", conceptId: "concept-a", title: "Existing" },
			draft: { title: "Merged", englishName: "", coreMeaning: "Merged meaning", whyItMatters: "", importance: "normal", learningMode: "reviewable", tags: [] },
			origin: { kind: "inbox", proposalId: proposal.id, proposalUpdatedAt: proposal.updatedAt },
		});
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const reviews = new ReviewStateStore(storage, new FsrsReviewScheduler());
		await reviews.load();
		const merging = merges.execute(prepared.plan);
		await written.promise;
		const reviewing = reviews.recordReview("card-a", "good");
		storage.failNextSave = failCommit;
		release.resolve();
		const [result] = await Promise.all([merging, reviewing]);
		assert.equal(result.status, failCommit ? "failed" : "merged");
		assert.equal(storage.data.reviewStates["card-a"]?.reviewCount, 1);
		assert.equal(storage.data.knowledgeProposals[proposal.id]?.status, failCommit ? "suggested" : "written");
		assert.equal(markdown, failCommit ? original : prepared.plan.after);
	}
	{
		const first = new MemoryStorage();
		const second = new MemoryStorage();
		const entered = deferred();
		const release = deferred();
		const pending = runPluginDataMutation(first, async () => { entered.resolve(); await release.promise; });
		await entered.promise;
		await new KnowledgeProposalStore(second).upsertProposal(proposal);
		assert.ok(second.data.knowledgeProposals[proposal.id], "separate Vault owners do not block each other");
		release.resolve();
		await pending;
	}
	console.log("Plugin data concurrency tests passed.");
}

export const done = run();

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => { resolve = complete; });
	return { promise, resolve };
}
