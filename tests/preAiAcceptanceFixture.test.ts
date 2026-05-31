import assert from "node:assert/strict";
import {
	ACCEPTANCE_CARD_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_SOURCE_NOTE_TEMPLATE,
	ACCEPTANCE_SOURCE_PATH,
} from "../src/acceptance/preAiAcceptanceFixture";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { PreAiAcceptanceFixtureService } from "../src/services/preAiAcceptanceFixtureService";
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
}

async function createFixtureService(
	storage = new MemoryKnowledgeProposalStorage(createPluginData()),
	vault = new MemoryVaultAdapter(),
) {
	const proposalStore = new KnowledgeProposalStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const service = new PreAiAcceptanceFixtureService({
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
		assert.equal(cardProposal?.kind, "new_card");
		assert.equal(conceptProposal?.status, "suggested");
		assert.equal(cardProposal?.status, "suggested");
		assert.equal(conceptProposal?.sourcePath, ACCEPTANCE_SOURCE_PATH);
		assert.equal(cardProposal?.sourcePath, ACCEPTANCE_SOURCE_PATH);
		assert.equal(conceptProposal?.sourceHash, sourceRecord.contentHash);
		assert.equal(cardProposal?.sourceHash, sourceRecord.contentHash);
		assert.equal(validateKnowledgeProposalPayload(conceptProposal!).valid, true);
		assert.equal(validateKnowledgeProposalPayload(cardProposal!).valid, true);
	}

	{
		const { proposalStore, service } = await createFixtureService();

		await service.createFixture();
		await service.createFixture();

		const proposals = await proposalStore.listProposals();

		assert.equal(proposals.length, 2);
		assert.deepEqual(proposals.map((proposal) => proposal.id).sort(), [
			ACCEPTANCE_CARD_PROPOSAL_ID,
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
		assert.equal(typeof storage.savedData?.knowledgeProposals[ACCEPTANCE_CARD_PROPOSAL_ID], "object");
	}
}

export const done = runAsyncTests();
