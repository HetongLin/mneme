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

	constructor(private readonly existingPaths: Set<string>) {
	}

	async exists(path: string): Promise<boolean> {
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
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[rejectedProposal.id]: rejectedProposal,
			[writtenProposal.id]: writtenProposal,
			[approvedProposal.id]: approvedProposal,
			[activeProposal.id]: activeProposal,
		}));
		const vault = new MemoryVaultStateAdapter(new Set(["Notes/Existing.md"]));
		const result = await createReconciler(storage, vault).reconcile();
		const proposals = storage.savedData?.knowledgeProposals ?? {};

		assert.deepEqual(result.removedProposalIds.sort(), [
			"approved-proposal",
			"rejected-proposal",
			"written-proposal",
		]);
		assert.equal(typeof proposals["active-proposal"], "object");
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
