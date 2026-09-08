import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import type { ConceptSummaryScanner } from "../src/services/preAiAcceptanceFixtureService";
import { VaultStateReconciler, type VaultStateAdapter } from "../src/services/vaultStateReconciler";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	createConceptSourceLink,
	createPluginData,
	createProposal,
	createSourceRecord,
	MemoryKnowledgeProposalStorage,
} from "./knowledgeProposalTestUtils";

class MemoryVaultStateAdapter implements VaultStateAdapter {
	deletedFiles: string[] = [];

	constructor(
		private readonly existingPaths: Set<string>,
		private readonly onExists?: (path: string) => Promise<void>,
	) {
	}

	async exists(path: string): Promise<boolean> {
		await this.onExists?.(path);
		return this.existingPaths.has(path);
	}

	async listMarkdownFiles(): Promise<Array<{ path: string }>> {
		return [...this.existingPaths]
			.filter((path) => path.endsWith(".md"))
			.map((path) => ({ path }));
	}
}

class MemoryConceptScanner implements ConceptSummaryScanner {
	constructor(private readonly concepts: ConceptSummary[] = []) {
	}

	async scanConcepts(): Promise<ConceptSummary[]> {
		return [...this.concepts];
	}
}

function createReconciler(
	storage: MemoryKnowledgeProposalStorage,
	vault: MemoryVaultStateAdapter,
	concepts: ConceptSummary[] = [],
): VaultStateReconciler {
	return new VaultStateReconciler({
		conceptScanner: new MemoryConceptScanner(concepts),
		conceptSourceLinkStore: new ConceptSourceLinkStore(storage),
		knowledgeProposalStore: new KnowledgeProposalStore(storage),
		sourceAnalysisStore: new SourceAnalysisStore(storage),
		vault,
	});
}

async function runAsyncTests(): Promise<void> {
	{
		const missingSourceProposal = createProposal("missing-source", {
			sourcePath: "Notes/Missing.md",
			status: "suggested",
		});
		const existingSourceProposal = createProposal("existing-source", {
			sourcePath: "Notes/Existing.md",
			status: "suggested",
		});
		const noSourceProposal = createProposal("no-source", {
			sourcePath: undefined,
			status: "suggested",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[missingSourceProposal.id]: missingSourceProposal,
			[existingSourceProposal.id]: existingSourceProposal,
			[noSourceProposal.id]: noSourceProposal,
		}));
		const vault = new MemoryVaultStateAdapter(new Set(["Notes/Existing.md"]));
		const result = await createReconciler(storage, vault).reconcile();
		const proposals = storage.savedData?.knowledgeProposals ?? {};

		assert.deepEqual(result.removedProposalIds, ["missing-source"]);
		assert.equal(proposals["missing-source"], undefined);
		assert.equal(typeof proposals["existing-source"], "object");
		assert.equal(typeof proposals["no-source"], "object");
		assert.deepEqual(vault.deletedFiles, []);
	}

	{
		const rejectedProposal = createProposal("rejected-proposal", {
			sourcePath: "Notes/Existing.md",
			status: "rejected",
		});
		const writtenProposal = createProposal("written-proposal", {
			sourcePath: "Notes/Existing.md",
			status: "written",
		});
		const approvedProposal = createProposal("approved-proposal", {
			sourcePath: "Notes/Existing.md",
			status: "approved",
		});
		const activeProposal = createProposal("active-proposal", {
			sourcePath: "Notes/Existing.md",
			status: "edited",
		});
		const sourceRecord = {
			...createSourceRecord("Notes/Existing.md"),
			pendingProposalIds: [
				rejectedProposal.id,
				writtenProposal.id,
				approvedProposal.id,
				activeProposal.id,
			],
		};
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[rejectedProposal.id]: rejectedProposal,
			[writtenProposal.id]: writtenProposal,
			[approvedProposal.id]: approvedProposal,
			[activeProposal.id]: activeProposal,
		}, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const vault = new MemoryVaultStateAdapter(new Set(["Notes/Existing.md"]));
		const result = await createReconciler(storage, vault).reconcile();
		const proposals = storage.savedData?.knowledgeProposals ?? {};

		assert.deepEqual(result.removedProposalIds, ["rejected-proposal", "written-proposal"]);
		assert.equal(typeof proposals["active-proposal"], "object");
		assert.equal(typeof proposals["approved-proposal"], "object");
		assert.deepEqual(
			storage.savedData?.sourceAnalysisRecords["Notes/Existing.md"]?.pendingProposalIds,
			["approved-proposal", "active-proposal"],
		);
	}

	{
		const receiptProposal = createProposal("receipt-proposal", {
			sourcePath: "Notes/Deleted.md",
			status: "written",
			writeReceipt: {
				version: 1,
				proposalHash: "proposal-hash",
				targetPath: "Mneme/Concepts/Recovered/Concept.md",
				mode: "create",
				afterHash: "after-hash",
				createdAt: "2026-01-01T12:00:00.000Z",
			},
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[receiptProposal.id]: receiptProposal,
		}));
		const result = await createReconciler(storage, new MemoryVaultStateAdapter(new Set())).reconcile();
		const data = await storage.loadData() as ReturnType<typeof createPluginData>;

		assert.deepEqual(result.removedProposalIds, []);
		assert.deepEqual(data.knowledgeProposals[receiptProposal.id], receiptProposal);
	}

	{
		const proposal = createProposal("concurrent-proposal", {
			sourcePath: "Notes/Deleted.md",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[proposal.id]: proposal,
		}));
		let updated = false;
		const vault = new MemoryVaultStateAdapter(new Set(), async (path) => {
			if (path !== proposal.sourcePath || updated) return;
			updated = true;
			const data = await storage.loadData() as ReturnType<typeof createPluginData>;
			await storage.saveData({
				...data,
				knowledgeProposals: {
					...data.knowledgeProposals,
					[proposal.id]: {
						...proposal,
						status: "approved",
						writeReceipt: {
							version: 1,
							proposalHash: "proposal-hash",
							targetPath: "Mneme/Concepts/Recovered/Concept.md",
							mode: "create",
							afterHash: "after-hash",
							createdAt: "2026-01-01T12:00:00.000Z",
							},
						},
				},
			});
		});
		const result = await createReconciler(storage, vault).reconcile();

		assert.deepEqual(result.removedProposalIds, []);
		assert.equal(storage.savedData?.knowledgeProposals[proposal.id]?.status, "approved");
		assert.equal(storage.savedData?.knowledgeProposals[proposal.id]?.writeReceipt?.targetPath,
			"Mneme/Concepts/Recovered/Concept.md");
	}

	{
		const missingRecord = createSourceRecord("Notes/Missing.md");
		const existingRecord = createSourceRecord("Notes/Existing.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {
			[missingRecord.sourcePath]: missingRecord,
			[existingRecord.sourcePath]: existingRecord,
		}));
		const vault = new MemoryVaultStateAdapter(new Set(["Notes/Existing.md"]));
		const result = await createReconciler(storage, vault).reconcile();
		const records = storage.savedData?.sourceAnalysisRecords ?? {};

		assert.deepEqual(result.removedSourcePaths, ["Notes/Missing.md"]);
		assert.equal(records["Notes/Missing.md"], undefined);
		assert.equal(typeof records["Notes/Existing.md"], "object");
	}

	{
		const missingSourceLink = createConceptSourceLink("missing-source-link", {
			conceptId: "concept-existing",
			sourcePath: "Notes/Missing.md",
		});
		const missingConceptLink = createConceptSourceLink("missing-concept-link", {
			conceptId: "concept-missing",
			sourcePath: "Notes/Existing.md",
		});
		const validLink = createConceptSourceLink("valid-link", {
			conceptId: "concept-existing",
			sourcePath: "Notes/Existing.md",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {}, {
			[missingSourceLink.id]: missingSourceLink,
			[missingConceptLink.id]: missingConceptLink,
			[validLink.id]: validLink,
		}));
		const vault = new MemoryVaultStateAdapter(new Set(["Notes/Existing.md"]));
		const result = await createReconciler(storage, vault, [{
			conceptId: "concept-existing",
			path: "Mneme/Concepts/Existing/Concept.md",
			title: "Existing",
		}]).reconcile();
		const links = storage.savedData?.conceptSourceLinks ?? {};

		assert.deepEqual(result.removedConceptSourceLinkIds, ["missing-concept-link"]);
		assert.deepEqual(result.staleConceptSourceLinkIds, ["missing-source-link"]);
		assert.deepEqual(result.missingConceptIds, ["concept-missing"]);
		assert.equal(typeof links["valid-link"], "object");
		assert.equal(links["missing-source-link"]?.status, "stale");
		assert.equal(links["missing-source-link"]?.sourceHash, "source-hash");
		assert.equal(links["missing-concept-link"], undefined);

		const second = await createReconciler(storage, vault, [{
			conceptId: "concept-existing",
			path: "Mneme/Concepts/Existing/Concept.md",
			title: "Existing",
		}]).reconcile();

		assert.deepEqual(second.staleConceptSourceLinkIds, []);
		assert.equal(storage.savedData?.conceptSourceLinks["missing-source-link"]?.status, "stale");
	}

	{
		const keepProposal = createProposal("keep-proposal", { status: "suggested" });
		const missingDelete = createSourceRecord("Notes/Missing-Delete.md");
		const missingUpdated = createSourceRecord("Notes/Missing-Updated.md");
		const existingRecord = createSourceRecord("Notes/Existing-Updated.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[keepProposal.id]: keepProposal,
		}, {
			[missingDelete.sourcePath]: missingDelete,
			[missingUpdated.sourcePath]: missingUpdated,
			[existingRecord.sourcePath]: existingRecord,
		}));
		const sourceStore = new SourceAnalysisStore(storage);
		let interleaved = false;
		const vault = new MemoryVaultStateAdapter(new Set([existingRecord.sourcePath]), async (path) => {
			if (path !== missingUpdated.sourcePath || interleaved) return;
			interleaved = true;
			await sourceStore.upsertRecord({ ...missingUpdated, contentHash: "updated-hash", lastAiCaptureFingerprint: "updated-fingerprint", pendingProposalIds: [keepProposal.id] });
			await sourceStore.upsertRecord({ ...existingRecord, contentHash: "existing-updated-hash", pendingProposalIds: [keepProposal.id] });
			await sourceStore.upsertRecord({ ...createSourceRecord("Notes/New-During-Reconcile.md"), pendingProposalIds: [keepProposal.id] });
		});
		const result = await createReconciler(storage, vault).reconcile();
		const data = await storage.loadData() as ReturnType<typeof createPluginData>;

		assert.deepEqual(result.removedSourcePaths, [missingDelete.sourcePath]);
		assert.equal(data.sourceAnalysisRecords[missingDelete.sourcePath], undefined);
		assert.equal(data.sourceAnalysisRecords[missingUpdated.sourcePath]?.contentHash, "updated-hash");
		assert.equal(data.sourceAnalysisRecords[missingUpdated.sourcePath]?.lastAiCaptureFingerprint, "updated-fingerprint");
		assert.deepEqual(data.sourceAnalysisRecords[missingUpdated.sourcePath]?.pendingProposalIds, [keepProposal.id]);
		assert.equal(data.sourceAnalysisRecords[existingRecord.sourcePath]?.contentHash, "existing-updated-hash");
		assert.equal(data.sourceAnalysisRecords["Notes/New-During-Reconcile.md"]?.contentHash, "source-hash");
	}

	{
		const candidate = createSourceRecord("Notes/Updated-Candidate.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {
			[candidate.sourcePath]: candidate,
		}));
		const sourceStore = new SourceAnalysisStore(storage);
		let updated = false;
		const vault = new MemoryVaultStateAdapter(new Set(), async (path) => {
			if (path !== candidate.sourcePath || updated) return;
			updated = true;
			await sourceStore.upsertRecord({ ...candidate, contentHash: "relinked-hash" });
		});
		const result = await createReconciler(storage, vault).reconcile();

		assert.deepEqual(result.removedSourcePaths, []);
		assert.equal((await storage.loadData() as ReturnType<typeof createPluginData>).sourceAnalysisRecords[candidate.sourcePath]?.contentHash, "relinked-hash");
	}

	{
		const deleted = createSourceRecord("Notes/Deleted-During-Check.md");
		const stale = createSourceRecord("Notes/Absent.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {
			[deleted.sourcePath]: deleted, [stale.sourcePath]: stale,
		}));
		const sourceStore = new SourceAnalysisStore(storage);
		const vault = new MemoryVaultStateAdapter(new Set([deleted.sourcePath]), async (path) => {
			if (path === deleted.sourcePath) await sourceStore.removeRecord(deleted.sourcePath);
		});
		const result = await createReconciler(storage, vault).reconcile();
		assert.deepEqual(await sourceStore.loadRecords(), {});
		assert.deepEqual(result.removedSourcePaths, [stale.sourcePath]);
	}

	{
		const record = createSourceRecord("Notes/Pending-Late.md");
		record.pendingProposalIds = ["late-proposal"];
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {
			[record.sourcePath]: record,
		}));
		const proposalStore = new KnowledgeProposalStore(storage);
		let added = false;
		const vault = new MemoryVaultStateAdapter(new Set([record.sourcePath]), async (path) => {
			if (path !== record.sourcePath || added) return;
			added = true;
			await proposalStore.upsertProposal(createProposal("late-proposal", { status: "suggested" }));
		});
		const result = await createReconciler(storage, vault).reconcile();
		const data = await storage.loadData() as ReturnType<typeof createPluginData>;

		assert.deepEqual(result.removedSourcePaths, []);
		assert.deepEqual(data.sourceAnalysisRecords[record.sourcePath]?.pendingProposalIds, ["late-proposal"]);
		assert.equal(data.knowledgeProposals["late-proposal"]?.status, "suggested");
	}

	{
		const staleLink = createConceptSourceLink("stale-during-reconcile", {
			conceptId: "concept-existing",
			sourcePath: "Notes/Missing-Stale.md",
		});
		const removedLink = createConceptSourceLink("removed-during-reconcile", {
			conceptId: "concept-missing",
			sourcePath: "Notes/Missing-Removed.md",
		});
		const updatedLink = createConceptSourceLink("updated-during-reconcile", {
			conceptId: "concept-missing",
			sourcePath: "Notes/Missing-Updated-Link.md",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {}, {
			[staleLink.id]: staleLink,
			[removedLink.id]: removedLink,
			[updatedLink.id]: updatedLink,
		}));
		const linkStore = new ConceptSourceLinkStore(storage);
		let interleaved = false;
		const vault = new MemoryVaultStateAdapter(new Set(), async (path) => {
			if (path !== updatedLink.sourcePath || interleaved) return;
			interleaved = true;
			await linkStore.upsertLink({ ...updatedLink, conceptId: "concept-existing", sourcePath: "Notes/Existing.md" });
			await linkStore.upsertLink(createConceptSourceLink("new-during-link-reconcile", {
				conceptId: "concept-existing",
				sourcePath: "Notes/Existing.md",
			}));
		});
		const result = await createReconciler(storage, vault, [{
			conceptId: "concept-existing",
			path: "Mneme/Concepts/Existing/Concept.md",
			title: "Existing",
		}]).reconcile();
		const data = await storage.loadData() as ReturnType<typeof createPluginData>;

		assert.deepEqual(result.removedConceptSourceLinkIds, [removedLink.id]);
		assert.deepEqual(result.staleConceptSourceLinkIds, [staleLink.id]);
		assert.equal(data.conceptSourceLinks[updatedLink.id]?.conceptId, "concept-existing");
		assert.equal(data.conceptSourceLinks["new-during-link-reconcile"]?.status, "approved");
	}

	{
		const candidate = createConceptSourceLink("explicitly-removed-link", {
			conceptId: "concept-existing",
			sourcePath: "Notes/Missing-Explicitly-Removed.md",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {}, {
			[candidate.id]: candidate,
		}));
		const linkStore = new ConceptSourceLinkStore(storage);
		let removed = false;
		const vault = new MemoryVaultStateAdapter(new Set(), async (path) => {
			if (path !== candidate.sourcePath || removed) return;
			removed = true;
			await linkStore.clearLinks();
		});
		const result = await createReconciler(storage, vault, [{
			conceptId: "concept-existing",
			path: "Mneme/Concepts/Existing/Concept.md",
			title: "Existing",
		}]).reconcile();
		const data = await storage.loadData() as ReturnType<typeof createPluginData>;

		assert.deepEqual(result.removedConceptSourceLinkIds, []);
		assert.deepEqual(result.staleConceptSourceLinkIds, []);
		assert.equal(data.conceptSourceLinks[candidate.id], undefined);
	}

	{
		const proposal = createProposal("proposal-a", {
			sourcePath: "Notes/Missing.md",
		});
		const sourceRecord = createSourceRecord("Notes/Missing.md");
		const link = createConceptSourceLink("link-a", {
			conceptId: "concept-missing",
			sourcePath: "Notes/Missing.md",
		});
		const storage = new MemoryKnowledgeProposalStorage({
			...createPluginData({
				[proposal.id]: proposal,
			}, {
				[sourceRecord.sourcePath]: sourceRecord,
			}, {
				[link.id]: link,
			}),
			reviewStates: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					createdAt: "2026-01-01T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 1,
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			settings: {
				...DEFAULT_SETTINGS,
				fsrsRequestRetention: 0.85,
			},
		});
		const vault = new MemoryVaultStateAdapter(new Set<string>());
		const result = await createReconciler(storage, vault).reconcile();

		assert.equal(result.removedProposalIds.length, 1);
		assert.equal(result.removedSourcePaths.length, 1);
		assert.equal(result.removedConceptSourceLinkIds.length, 1);
		assert.equal(result.staleConceptSourceLinkIds.length, 0);
		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.deepEqual(vault.deletedFiles, []);
	}
}

export const done = runAsyncTests();
