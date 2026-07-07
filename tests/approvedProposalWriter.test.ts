import assert from "node:assert/strict";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
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

	async modify(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) {
			throw new Error(`Missing file: ${path}`);
		}

		this.files.set(path, content);
	}
}

class FailingConceptSourceLinkStore extends ConceptSourceLinkStore {
	async upsertLink(): Promise<void> {
		throw new Error("Concept-source link write failed");
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
	const conceptSourceLinkStore = new ConceptSourceLinkStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const writer = new ApprovedProposalWriter({
		conceptSourceLinkStore,
		conceptScanner: {
			scanConcepts: async () => [{
				conceptId: "concept-encapsulation",
				path: "Mneme/Concepts/Encapsulation/Concept.md",
				title: "Encapsulation",
			}],
		},
		now: () => "2026-01-02T12:00:00.000Z",
		proposalStore: store,
		settingsProvider: () => DEFAULT_SETTINGS,
		sourceAnalysisStore,
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
		const content = await vault.read("Mneme/Concepts/Encapsulation/Concept.md");
		assert.match(content, /^---\nmneme_type: concept\nmneme_id: concept-encapsulation\nmneme_version: 1/m);
		assert.match(content, /## Core Meaning/);
		assert.equal(content.includes("sourceHash"), false);
		assert.equal(content.includes("fsrsState"), false);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createApprovedCardProposal();
		const { store, vault, writer } = await createWriter({ [proposal.id]: proposal });
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(vault.files.has("Mneme/Cards/Encapsulation/Card.md"), true);
		const content = await vault.read("Mneme/Cards/Encapsulation/Card.md");
		assert.match(content, /^---\nmneme_type: card_group\nmneme_concept_id: concept-encapsulation\nmneme_version: 1/m);
		assert.match(content, /Related Concept: \[\[Mneme\/Concepts\/Encapsulation\/Concept\|Encapsulation\]\]/);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("proposal-view", {
			kind: "add_view",
			payload: {
				conceptId: "concept-encapsulation",
				conceptTitle: "Encapsulation",
				view: {
					body: "A stable interface lets internal representation change independently.",
					title: "Change boundary",
				},
			},
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const vault = new MemoryVaultAdapter({
			[conceptPath]: "# Encapsulation\n\n## Views\n\n## Source Notes\n",
		});
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, [conceptPath]);
		assert.match(await vault.read(conceptPath), /### Change boundary\n\nA stable interface/);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("proposal-view-retry", {
			kind: "add_view",
			payload: {
				conceptId: "concept-encapsulation",
				view: {
					body: "A stable interface lets internals change.",
					title: "Change boundary",
				},
			},
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const original = "# Encapsulation\n\n## Views\n\n### Change boundary\n\nA stable interface lets internals change.\n";
		const vault = new MemoryVaultAdapter({ [conceptPath]: original });
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(await vault.read(conceptPath), original);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("proposal-view-conflict", {
			kind: "add_view",
			payload: {
				conceptId: "concept-encapsulation",
				view: {
					body: "New body.",
					title: "Change boundary",
				},
			},
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const original = "# Encapsulation\n\n## Views\n\n### Change boundary\n\nExisting body.\n";
		const vault = new MemoryVaultAdapter({ [conceptPath]: original });
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.match(result.message, /already exists with different content/);
		assert.equal(await vault.read(conceptPath), original);
		assert.equal((await store.getProposal(proposal.id))?.status, "approved");
	}

	{
		const proposal = createProposal("proposal-existing-source-link", {
			kind: "link_existing_concept",
			payload: {
				proposedSourceLink: {
					evidence: [{ excerpt: "Interfaces isolate representation changes." }],
					relationType: "supporting",
					sourceHash: "source-hash",
					sourcePath: "Notes/Intro.md",
				},
				targetConceptId: "concept-encapsulation",
				targetConceptTitle: "Encapsulation",
			},
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData(
			{ [proposal.id]: proposal },
			{ [sourceRecord.sourcePath]: sourceRecord },
		));
		const vault = new MemoryVaultAdapter({
			[conceptPath]: "# Encapsulation\n\n## Source Notes\n\n> [!info]- Source Notes\n> Add source notes here.\n",
		});
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault, storage);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.match(await vault.read(conceptPath), /> - \[\[Notes\/Intro\]\]/);
		assert.equal(Object.values(storage.savedData?.conceptSourceLinks ?? {}).length, 1);
		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"].linkedConceptIds, [
			"concept-encapsulation",
		]);
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

	{
		const proposal = createProposal("proposal-with-source", {
			kind: "new_concept",
			payload: {
				proposedSourceLinks: [{
					evidence: [{ excerpt: "Encapsulation hides representation." }],
					relationType: "supporting",
					sourceHash: "source-hash",
					sourcePath: "Notes/Intro.md",
				}],
				title: "Encapsulation",
			},
			status: "approved",
		});
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);
		const result = await writer.writeApprovedProposal(proposal.id);
		const links = Object.values(storage.savedData?.conceptSourceLinks ?? {});

		assert.equal(result.status, "written");
		assert.equal(links.length, 1);
		assert.equal(links[0].relationType, "supporting");
		assert.equal(links[0].evidence[0].excerpt, "Encapsulation hides representation.");
	}

	{
		const proposal = createProposal("proposal-source-record", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);

		await writer.writeApprovedProposal(proposal.id);

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath].linkedConceptIds, [
			"concept-encapsulation",
		]);
	}

	{
		const proposal = createProposal("proposal-existing-links", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const sourceRecord = {
			...createSourceRecord("Notes/Intro.md"),
			linkedConceptIds: ["existing-concept"],
		};
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);

		await writer.writeApprovedProposal(proposal.id);

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath].linkedConceptIds, [
			"existing-concept",
			"concept-encapsulation",
		]);
	}

	{
		const proposal = createProposal("proposal-no-duplicate-links", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const sourceRecord = {
			...createSourceRecord("Notes/Intro.md"),
			linkedConceptIds: ["concept-encapsulation"],
		};
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);

		await writer.writeApprovedProposal(proposal.id);

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath].linkedConceptIds, [
			"concept-encapsulation",
		]);
	}

	{
		const proposal = createProposal("proposal-vault-fail-no-index", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const vault = new MemoryVaultAdapter();
		vault.shouldFailCreate = true;
		const { writer } = await createWriter({ [proposal.id]: proposal }, vault, storage);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal(storage.savedData, undefined);
	}

	{
		const proposal = createApprovedConceptProposal("proposal-no-source");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(storage.savedData?.conceptSourceLinks, {});
	}

	{
		const proposal = createApprovedCardProposal("proposal-card-unchanged");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);

		await writer.writeApprovedProposal(proposal.id);

		assert.deepEqual(storage.savedData?.conceptSourceLinks, {});
		assert.deepEqual(storage.savedData?.reviewStates, {});
	}

	{
		const proposal = createProposal("proposal-link-fails", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			"Notes/Intro.md": createSourceRecord("Notes/Intro.md"),
		}));
		const store = new KnowledgeProposalStore(storage);
		const vault = new MemoryVaultAdapter();
		const writer = new ApprovedProposalWriter({
			conceptSourceLinkStore: new FailingConceptSourceLinkStore(storage),
			now: () => "2026-01-02T12:00:00.000Z",
			proposalStore: store,
			settingsProvider: () => DEFAULT_SETTINGS,
			sourceAnalysisStore: new SourceAnalysisStore(storage),
			vaultAdapter: vault,
		});
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation/Concept.md"), true);
		assert.equal((await store.getProposal(proposal.id))?.status, "approved");
	}
}

export const done = runAsyncTests();
