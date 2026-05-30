import assert from "node:assert/strict";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { createPluginData, createProposal, createSourceRecord, MemoryKnowledgeProposalStorage } from "./knowledgeProposalTestUtils";
import { DEFAULT_SETTINGS } from "../src/models/settings";

class MemoryVaultAdapter implements MnemeVaultAdapter {
	createdFolders = new Set<string>();
	files = new Map<string, string>();
	shouldFailCreate = false;

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
		if (this.shouldFailCreate) {
			throw new Error("Vault create failed");
		}

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

async function createWriter(
	proposals = {},
	vault = new MemoryVaultAdapter(),
	storage = new MemoryKnowledgeProposalStorage(createPluginData(proposals)),
): Promise<{
	storage: MemoryKnowledgeProposalStorage;
	store: KnowledgeProposalStore;
	vault: MemoryVaultAdapter;
	writer: ApprovedProposalWriter;
}> {
	const store = new KnowledgeProposalStore(storage);
	const writer = new ApprovedProposalWriter({
		now: () => "2026-01-02T12:00:00.000Z",
		proposalStore: store,
		settingsProvider: () => DEFAULT_SETTINGS,
		vaultAdapter: vault,
	});

	return {
		storage,
		store,
		vault,
		writer,
	};
}

function createApprovedConceptProposal(id = "proposal-a") {
	return createProposal(id, {
		kind: "new_concept",
		payload: {
			coreMeaning: "Encapsulation protects internal representation.",
			title: "Encapsulation",
		},
		status: "approved",
	});
}

function createApprovedCardProposal(id = "proposal-card") {
	return createProposal(id, {
		kind: "new_card",
		payload: {
			card: {
				back: "Encapsulation bundles data and behavior while hiding representation.",
				front: "What is encapsulation?",
				rubric: "Mention bundling and hidden representation.",
			},
			conceptId: "concept-encapsulation",
			conceptTitle: "Encapsulation",
		},
		status: "approved",
	});
}

async function runAsyncTests(): Promise<void> {
	{
		const proposal = createProposal("proposal-a", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			status: "suggested",
		});
		const { vault, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "skipped");
		assert.equal(vault.files.size, 0);
	}

	{
		const proposal = createProposal("proposal-a", {
			kind: "new_concept",
			payload: {
				title: "",
			},
			status: "approved",
		});
		const { vault, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal(vault.files.size, 0);
	}

	{
		const proposal = createApprovedConceptProposal();
		const { store, vault, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation/Concept.md"), true);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createApprovedCardProposal();
		const { store, vault, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(vault.files.has("Mneme/Cards/Encapsulation/Card.md"), true);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createApprovedConceptProposal();
		const vault = new MemoryVaultAdapter();
		vault.shouldFailCreate = true;
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal((await store.getProposal(proposal.id))?.status, "approved");
	}

	{
		const proposal = createApprovedConceptProposal();
		const vault = new MemoryVaultAdapter({
			"Mneme/Concepts/Encapsulation/Concept.md": "Existing content",
		});
		const { writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation/Concept-2.md"), true);
		assert.equal(vault.files.get("Mneme/Concepts/Encapsulation/Concept.md"), "Existing content");
	}

	{
		const proposal = createApprovedConceptProposal();
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage({
			...createPluginData({ [proposal.id]: proposal }, {
				[sourceRecord.sourcePath]: sourceRecord,
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
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);
		await writer.writeApprovedProposal(proposal.id);

		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
	}

	{
		const proposal = createProposal("proposal-a", {
			kind: "update_concept",
			payload: {
				conceptId: "concept-a",
				proposedSummary: "Updated summary",
			},
			status: "approved",
		});
		const { store, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "skipped");
		assert.equal((await store.getProposal(proposal.id))?.status, "approved");
	}

	{
		const proposal = createApprovedCardProposal();
		const { vault, writer } = await createWriter({ [proposal.id]: proposal });
		await writer.writeApprovedProposal(proposal.id);
		const content = await vault.read("Mneme/Cards/Encapsulation/Card.md");
		const parsedCards = parseMnemeCards(content);

		assert.equal(parsedCards.length, 1);
		assert.equal(parsedCards[0].isValid, true);
		assert.equal(parsedCards[0].hasExplicitCardId, true);
	}
}

export const done = runAsyncTests();
