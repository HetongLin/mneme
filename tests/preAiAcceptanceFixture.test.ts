import assert from "node:assert/strict";
import {
	ACCEPTANCE_CARD_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_ID,
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_TITLE,
	ACCEPTANCE_SOURCE_NOTE_TEMPLATE,
	ACCEPTANCE_SOURCE_PATH,
} from "../src/acceptance/preAiAcceptanceFixture";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { PreAiAcceptanceFixtureService } from "../src/services/preAiAcceptanceFixtureService";
import type { ConceptSummaryScanner } from "../src/services/preAiAcceptanceFixtureService";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { validateKnowledgeProposalPayload } from "../src/services/knowledgeProposalValidation";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	createConceptSourceLink,
	createPluginData,
	createProposal,
	createSourceRecord,
	MemoryKnowledgeProposalStorage,
} from "./knowledgeProposalTestUtils";

class MemoryVaultAdapter implements MnemeVaultAdapter {
	createdFolders = new Set<string>();
	files = new Map<string, string>();

	constructor(initialFiles: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initialFiles)) {
			this.files.set(path, content);
		}
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.createdFolders.has(path);
	}

	async createFolder(path: string): Promise<void> {
		this.createdFolders.add(path);
	}

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) {
			throw new Error(`File already exists: ${path}`);
		}

		this.files.set(path, content);
	}

	async append(path: string, content: string): Promise<void> {
		this.files.set(path, `${this.files.get(path) ?? ""}${content}`);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);

		if (content === undefined) {
			throw new Error(`Missing file: ${path}`);
		}

		return content;
	}

	async modify(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) {
			throw new Error(`Missing file: ${path}`);
		}

		this.files.set(path, content);
	}
}

class MemoryConceptScanner implements ConceptSummaryScanner {
	constructor(private readonly concepts: ConceptSummary[] = []) {
	}

	async scanConcepts(): Promise<ConceptSummary[]> {
		return [...this.concepts];
	}
}

async function createFixtureService(
	storage = new MemoryKnowledgeProposalStorage(createPluginData()),
	vault = new MemoryVaultAdapter(),
	conceptScanner = new MemoryConceptScanner(),
) {
	const proposalStore = new KnowledgeProposalStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const service = new PreAiAcceptanceFixtureService({
		conceptScanner,
		now: () => "2026-01-03T12:00:00.000Z",
		proposalStore,
		sourceAnalysisStore,
		vaultAdapter: vault,
	});

	return {
		proposalStore,
		service,
		sourceAnalysisStore,
		storage,
		vault,
	};
}

async function runAsyncTests(): Promise<void> {
	{
		const { service, vault } = await createFixtureService();
		const result = await service.createFixture();

		assert.equal(result.createdSourceNote, true);
		assert.equal(vault.files.get(ACCEPTANCE_SOURCE_PATH), ACCEPTANCE_SOURCE_NOTE_TEMPLATE);
		assert.equal(vault.files.has("Mneme/Acceptance/Concept.md"), false);
		assert.equal(vault.files.has("Mneme/Acceptance/Card.md"), false);
	}

	{
		const existingContent = "# Existing acceptance note";
		const { service, vault } = await createFixtureService(
			new MemoryKnowledgeProposalStorage(createPluginData()),
			new MemoryVaultAdapter({
				[ACCEPTANCE_SOURCE_PATH]: existingContent,
			}),
		);
		const result = await service.createFixture();

		assert.equal(result.createdSourceNote, false);
		assert.equal(vault.files.get(ACCEPTANCE_SOURCE_PATH), existingContent);
	}

	{
		const sourceRecord = createSourceRecord(ACCEPTANCE_SOURCE_PATH);
		const { proposalStore, service } = await createFixtureService(
			new MemoryKnowledgeProposalStorage(createPluginData({}, {
				[ACCEPTANCE_SOURCE_PATH]: sourceRecord,
			})),
		);

		await service.createFixture();

		const conceptProposal = await proposalStore.getProposal(ACCEPTANCE_CONCEPT_PROPOSAL_ID);
		const cardProposal = await proposalStore.getProposal(ACCEPTANCE_CARD_PROPOSAL_ID);

		assert.equal(conceptProposal?.kind, "new_concept");
		assert.equal(cardProposal, undefined);
		assert.equal(conceptProposal?.status, "suggested");
		assert.equal(conceptProposal?.sourcePath, ACCEPTANCE_SOURCE_PATH);
		assert.equal(conceptProposal?.sourceHash, sourceRecord.contentHash);
		assert.equal(validateKnowledgeProposalPayload(conceptProposal!).valid, true);
	}

	{
		const { proposalStore, service } = await createFixtureService();

		await service.createFixture();
		await service.createFixture();

		const proposals = await proposalStore.listProposals();

		assert.equal(proposals.length, 1);
		assert.deepEqual(proposals.map((proposal) => proposal.id).sort(), [
			ACCEPTANCE_CONCEPT_PROPOSAL_ID,
		].sort());
	}

	{
		const existingProposal = createProposal("existing-proposal");
		const sourceRecord = createSourceRecord("Notes/Existing.md");
		const link = createConceptSourceLink("link-a");
		const storage = new MemoryKnowledgeProposalStorage({
			...createPluginData({
				[existingProposal.id]: existingProposal,
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
		const { service } = await createFixtureService(storage);

		await service.createFixture();

		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
		assert.equal(typeof storage.savedData?.conceptSourceLinks[link.id], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[existingProposal.id], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[ACCEPTANCE_CONCEPT_PROPOSAL_ID], "object");
		assert.equal(storage.savedData?.knowledgeProposals[ACCEPTANCE_CARD_PROPOSAL_ID], undefined);
	}

	{
		const { proposalStore, service } = await createFixtureService();
		const result = await service.generateCardProposal();

		assert.equal(result.status, "missing_concept");
		assert.equal(await proposalStore.getProposal(ACCEPTANCE_CARD_PROPOSAL_ID), undefined);
	}

	{
		const staleLink = createConceptSourceLink("stale-acceptance-link", {
			conceptId: ACCEPTANCE_CONCEPT_ID,
			sourcePath: ACCEPTANCE_SOURCE_PATH,
			status: "approved",
		});
		const { proposalStore, service } = await createFixtureService(
			new MemoryKnowledgeProposalStorage(createPluginData({}, {}, {
				[staleLink.id]: staleLink,
			})),
			new MemoryVaultAdapter(),
			new MemoryConceptScanner(),
		);
		const result = await service.generateCardProposal();

		assert.equal(result.status, "missing_concept");
		assert.equal(await proposalStore.getProposal(ACCEPTANCE_CARD_PROPOSAL_ID), undefined);
	}

	{
		const sourceRecord = createSourceRecord(ACCEPTANCE_SOURCE_PATH);
		const conceptPath = "Mneme/Concepts/Pre-AI-Acceptance-Pipeline.md";
		const conceptScanner = new MemoryConceptScanner([{
			conceptId: ACCEPTANCE_CONCEPT_ID,
			path: conceptPath,
			title: ACCEPTANCE_CONCEPT_TITLE,
		}]);
		const { proposalStore, service, vault } = await createFixtureService(
			new MemoryKnowledgeProposalStorage(createPluginData({}, {
				[ACCEPTANCE_SOURCE_PATH]: sourceRecord,
			})),
			new MemoryVaultAdapter(),
			conceptScanner,
		);
		const result = await service.generateCardProposal();
		const cardProposal = await proposalStore.getProposal(ACCEPTANCE_CARD_PROPOSAL_ID);

		assert.equal(result.status, "created");
		assert.equal(cardProposal?.kind, "new_card");
		assert.equal(cardProposal?.status, "suggested");
		assert.equal(cardProposal?.conceptId, ACCEPTANCE_CONCEPT_ID);
		assert.equal(cardProposal?.sourcePath, conceptPath);
		assert.equal(cardProposal?.sourceHash, undefined);
		assert.equal(cardProposal?.kind === "new_card" ? cardProposal.payload?.conceptId : undefined, ACCEPTANCE_CONCEPT_ID);
		assert.equal(cardProposal?.kind === "new_card" ? cardProposal.payload?.conceptTitle : undefined, ACCEPTANCE_CONCEPT_TITLE);
		assert.equal(validateKnowledgeProposalPayload(cardProposal!).valid, true);
		assert.equal(vault.files.has("Mneme/Acceptance/Card.md"), false);
	}

	{
		const conceptScanner = new MemoryConceptScanner([{
			conceptId: ACCEPTANCE_CONCEPT_ID,
			path: "Mneme/Concepts/Pre-AI-Acceptance-Pipeline.md",
			title: ACCEPTANCE_CONCEPT_TITLE,
		}]);
		const { proposalStore, service } = await createFixtureService(
			new MemoryKnowledgeProposalStorage(createPluginData()),
			new MemoryVaultAdapter(),
			conceptScanner,
		);

		await service.generateCardProposal();
		await service.generateCardProposal();

		const proposals = await proposalStore.listProposals();

		assert.equal(proposals.length, 1);
		assert.equal(proposals[0].id, ACCEPTANCE_CARD_PROPOSAL_ID);
	}

	{
		const existingProposal = createProposal("existing-proposal");
		const sourceRecord = createSourceRecord("Notes/Existing.md");
		const link = createConceptSourceLink("link-a");
		const storage = new MemoryKnowledgeProposalStorage({
			...createPluginData({
				[existingProposal.id]: existingProposal,
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
		const conceptScanner = new MemoryConceptScanner([{
			conceptId: ACCEPTANCE_CONCEPT_ID,
			path: "Mneme/Concepts/Pre-AI-Acceptance-Pipeline.md",
			title: ACCEPTANCE_CONCEPT_TITLE,
		}]);
		const { service } = await createFixtureService(storage, new MemoryVaultAdapter(), conceptScanner);

		await service.generateCardProposal();

		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
		assert.equal(typeof storage.savedData?.conceptSourceLinks[link.id], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[existingProposal.id], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[ACCEPTANCE_CARD_PROPOSAL_ID], "object");
	}
}

export const done = runAsyncTests();
