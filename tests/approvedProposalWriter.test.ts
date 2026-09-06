import assert from "node:assert/strict";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { createPluginData, createProposal, createSourceRecord, MemoryKnowledgeProposalStorage } from "./knowledgeProposalTestUtils";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { getCardGroupPathFromConceptFrontmatter } from "../src/services/conceptMarkdownIdentity";

class MemoryVaultAdapter implements MnemeVaultAdapter {
	createdFolders = new Set<string>();
	files = new Map<string, string>();
	shouldFailCreate = false;
	beforeNextWrite?: (current: string) => string;
	private processBarrier?: { entered: () => void; wait: Promise<void> };

	pauseNextProcess() {
		let enter!: () => void;
		let release!: () => void;
		const entered = new Promise<void>((resolve) => { enter = resolve; });
		const wait = new Promise<void>((resolve) => { release = resolve; });
		this.processBarrier = { entered: enter, wait };
		return { entered, release };
	}

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

		const current = this.files.get(path)!;
		this.files.set(path, this.beforeNextWrite?.(current) ?? current);
		this.beforeNextWrite = undefined;
		this.files.set(path, content);
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		const barrier = this.processBarrier;
		this.processBarrier = undefined;
		if (barrier) { barrier.entered(); await barrier.wait; }
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		const latest = this.beforeNextWrite?.(content) ?? content;
		this.beforeNextWrite = undefined;
		this.files.set(path, latest);
		this.files.set(path, transform(latest));
	}
}

class FailingCompletionStorage extends MemoryKnowledgeProposalStorage {
	async saveData(data: MnemePluginData): Promise<void> {
		if (Object.values(data.knowledgeProposals).some((proposal) => proposal.status === "written")) {
			throw new Error("Concept-source completion write failed");
		}
		await super.saveData(data);
	}
}

function createIdSequence(prefix: "card" | "concept"): () => string {
	const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
	let index = 0;

	return () => {
		const suffix = alphabet[index] ?? "z";
		index += 1;
		return `${prefix}-2222222${suffix}`;
	};
}

async function createWriter(
	proposals = {},
	vault = new MemoryVaultAdapter(),
	storage = new MemoryKnowledgeProposalStorage(createPluginData(proposals)),
	concept: ConceptSummary = {
		conceptId: "concept-encapsulation",
		path: "Mneme/Concepts/Encapsulation/Concept.md",
		title: "Encapsulation",
	},
	isCardIdReserved: (cardId: string) => Promise<boolean> = async () => false,
): Promise<{
	storage: MemoryKnowledgeProposalStorage;
	store: KnowledgeProposalStore;
	vault: MemoryVaultAdapter;
	writer: ApprovedProposalWriter;
}> {
	const store = new KnowledgeProposalStore(storage);
	const conceptSourceLinkStore = new ConceptSourceLinkStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const cardIdFactory = createIdSequence("card");
	const conceptIdFactory = createIdSequence("concept");
	const writer = new ApprovedProposalWriter({
		storage,
		cardIdFactory,
		conceptIdFactory,
		conceptScanner: {
			scanConcepts: async () => [concept],
		},
		isCardIdReserved,
		now: () => "2026-01-02T12:00:00.000Z",
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
				cardType: "definition",
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
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation.md"), true);
		const content = await vault.read("Mneme/Concepts/Encapsulation.md");
		assert.match(content, /^---\nmneme_type: concept\nmneme_id: concept-22222222\nmneme_title: "Encapsulation"\nmneme_version: 1/m);
		assert.equal(content.includes("mneme_english_name"), false);
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
		assert.equal(vault.files.has("Mneme/Cards/Encapsulation/Cards.md"), true);
		const content = await vault.read("Mneme/Cards/Encapsulation/Cards.md");
		assert.match(content, /^---\nmneme_type: card_group\nmneme_concept_id: concept-encapsulation/m);
		assert.match(content, /mneme_concept_id: concept-encapsulation/);
		assert.match(content, /MNEME:CARD:start id="card-22222222" type="definition"/);
		assert.equal((content.match(/\bid=/g) ?? []).length, 1);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createApprovedCardProposal("proposal-card-reserved-id");
		const { vault, writer } = await createWriter(
			{ [proposal.id]: proposal },
			undefined,
			undefined,
			undefined,
			async (cardId) => cardId === "card-22222222",
		);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.match(
			await vault.read("Mneme/Cards/Encapsulation/Cards.md"),
			/MNEME:CARD:start id="card-22222223" type="definition"/,
		);
	}

	{
		const proposal = createApprovedCardProposal("proposal-concept-learning-card");
		proposal.cardId = "learning-definition";
		proposal.conceptId = "concept-concept-learning";
		proposal.payload!.conceptId = "concept-concept-learning";
		proposal.payload!.conceptTitle = "Concept Learning";
		proposal.payload!.card.front = "What is concept learning?";
		const { vault, writer } = await createWriter(
			{ [proposal.id]: proposal },
			undefined,
			undefined,
			{
				conceptId: "concept-concept-learning",
				path: "Mneme/Concepts/Concept-Learning.md",
				title: "Concept Learning",
			},
		);

		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.match(
			await vault.read("Mneme/Cards/Concept-Learning/Cards.md"),
			/MNEME:CARD:start id="learning-definition" type="definition"/,
		);
	}

	{
		const first = createApprovedCardProposal("proposal-card-one");
		const second = createApprovedCardProposal("proposal-card-two");
		second.payload!.card.front = "Why hide representation?";
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[first.id]: first,
			[second.id]: second,
		}));
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter({ [first.id]: first, [second.id]: second }, vault, storage);

		assert.equal((await writer.writeApprovedProposal(first.id)).status, "written");
		assert.equal((await writer.writeApprovedProposal(second.id)).status, "written");
		const cards = parseMnemeCards(await vault.read("Mneme/Cards/Encapsulation/Cards.md"));

		assert.equal(cards.length, 2);
		assert.deepEqual(cards.map((card) => card.front), ["What is encapsulation?", "Why hide representation?"]);
		assert.deepEqual(cards.map((card) => card.explicitCardId), [
			"card-22222222",
			"card-22222223",
		]);
	}

	{
		const first = createApprovedCardProposal("proposal-card-user-edit");
		const second = createApprovedCardProposal("proposal-card-after-user-edit");
		second.payload!.card.front = "Why hide representation?";
		const proposals = { [first.id]: first, [second.id]: second };
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter(proposals, vault);

		assert.equal((await writer.writeApprovedProposal(first.id)).status, "written");
		vault.beforeNextWrite = (current) => `${current}\n\n<!-- concurrent user edit -->\n`;
		assert.equal((await writer.writeApprovedProposal(second.id)).status, "written");
		assert.match(await vault.read("Mneme/Cards/Encapsulation/Cards.md"), /concurrent user edit/);
	}

	{
		const original = createApprovedCardProposal("proposal-card-original-concurrent");
		const first = createApprovedCardProposal("proposal-card-concurrent-a");
		const second = createApprovedCardProposal("proposal-card-concurrent-b");
		first.payload!.card.front = "Question A?";
		second.payload!.card.front = "Question B?";
		const proposals = { [original.id]: original, [first.id]: first, [second.id]: second };
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter(proposals, vault);
		assert.equal((await writer.writeApprovedProposal(original.id)).status, "written");
		const barrier = vault.pauseNextProcess();
		const writingFirst = writer.writeApprovedProposal(first.id);
		await barrier.entered;
		const writingSecond = writer.writeApprovedProposal(second.id);
		barrier.release();
		const results = await Promise.all([writingFirst, writingSecond]);
		assert.ok(results.every((result) => result.status === "written"));
		const cards = parseMnemeCards(await vault.read("Mneme/Cards/Encapsulation/Cards.md"));
		assert.deepEqual(cards.map((card) => card.front), [
			"What is encapsulation?", "Question A?", "Question B?",
		]);
		assert.deepEqual(cards.map((card) => card.explicitCardId), [
			"card-22222222", "card-22222223", "card-22222224",
		]);
	}

	{
		const first = createApprovedCardProposal("proposal-card-valid-before-corruption");
		const second = createApprovedCardProposal("proposal-card-after-corruption");
		second.payload!.card.front = "Should this append?";
		const proposals = { [first.id]: first, [second.id]: second };
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter(proposals, vault);
		const cardGroupPath = "Mneme/Cards/Encapsulation/Cards.md";

		assert.equal((await writer.writeApprovedProposal(first.id)).status, "written");
		const malformed = (await vault.read(cardGroupPath)).replace("<!-- MNEME:BACK:end -->", "");
		vault.files.set(cardGroupPath, malformed);
		const result = await writer.writeApprovedProposal(second.id);

		assert.equal(result.status, "failed");
		assert.match(result.message, /Repair invalid or unidentified Cards/);
		assert.equal(await vault.read(cardGroupPath), malformed);
	}

	{
		const proposal = createApprovedCardProposal("proposal-card-stable-group");
		proposal.payload!.conceptTitle = "Renamed Encapsulation";
		const declaredCardGroupPath = "Mneme/Cards/Stable-Identifier/Cards.md";
		const actualConceptPath = "Knowledge/Encapsulation.md";
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter(
			{ [proposal.id]: proposal },
			vault,
			undefined,
			{
				cardsPath: declaredCardGroupPath,
				conceptId: "concept-encapsulation",
				path: actualConceptPath,
				title: "Encapsulation as a Boundary",
			},
		);

		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, [declaredCardGroupPath]);
		const content = await vault.read(declaredCardGroupPath);
		assert.match(content, /concept: "\[\[Knowledge\/Encapsulation\|Encapsulation as a Boundary\]\]"/);
		assert.equal(vault.files.has("Mneme/Cards/Renamed-Encapsulation/Cards.md"), false);
	}

	{
		const proposal = createApprovedCardProposal("proposal-card-canonical-link");
		const declaredCardGroupPath = getCardGroupPathFromConceptFrontmatter({
			cards: "[[Mneme/Cards/Canonical-Concept/Cards|Canonical Concept Cards]]",
			mneme_id: "concept-encapsulation",
			mneme_type: "concept",
		});
		assert.equal(declaredCardGroupPath, "Mneme/Cards/Canonical-Concept/Cards.md");
		const vault = new MemoryVaultAdapter();
		const { writer } = await createWriter(
			{ [proposal.id]: proposal },
			vault,
			undefined,
			{
				cardsPath: declaredCardGroupPath,
				conceptId: "concept-encapsulation",
				path: "Mneme/Concepts/Canonical-Concept.md",
				title: "Canonical Concept",
			},
		);

		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, ["Mneme/Cards/Canonical-Concept/Cards.md"]);
		assert.equal(vault.files.has("Mneme/Cards/Canonical-Concept/Cards/Cards.md"), false);
	}

	{
		const proposal = createProposal("proposal-view", {
			kind: "add_view",
			payload: {
				conceptId: "concept-encapsulation",
				conceptTitle: "Encapsulation",
				view: {
					body: "A stable interface lets internal representation change independently.",
					evidence: [{ excerpt: "Clients depend on stable interfaces." }],
					sourcePath: "Notes/Interfaces.md",
					title: "Change boundary",
				},
			},
			sourceHash: "view-source-hash",
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const vault = new MemoryVaultAdapter({
			[conceptPath]: "# Encapsulation\n\n## Views\n\n## Source Notes\n",
		});
		const { storage, store, writer } = await createWriter({ [proposal.id]: proposal }, vault);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, [conceptPath]);
		assert.match(await vault.read(conceptPath), /### Change boundary\n\nA stable interface/);
		assert.match(await vault.read(conceptPath), /\[\[Notes\/Interfaces\]\]/);
		const sourceLinks = Object.values(storage.savedData?.conceptSourceLinks ?? {});
		assert.equal(sourceLinks.length, 1);
		assert.equal(sourceLinks[0].relationType, "supporting");
		assert.equal(sourceLinks[0].sourcePath, "Notes/Interfaces.md");
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
		proposal.sourceHash = "source-hash";
		proposal.sourcePath = "Notes/Intro.md";
		proposal.payload!.proposedSourceLinks = [{
			evidence: [{ excerpt: "Encapsulation hides representation." }],
			relationType: "origin",
			sourceHash: "source-hash",
			sourcePath: "Notes/Intro.md",
		}];
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const vault = new MemoryVaultAdapter({
			"Mneme/Concepts/Encapsulation.md": "Existing content",
		});
		const { writer } = await createWriter({ [proposal.id]: proposal }, vault, storage);
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation-2.md"), true);
		assert.equal(vault.files.get("Mneme/Concepts/Encapsulation.md"), "Existing content");
		assert.match(
			await vault.read("Mneme/Concepts/Encapsulation-2.md"),
			/cards: "\[\[Mneme\/Cards\/Encapsulation-2\/Cards\|Encapsulation Cards\]\]"/,
		);
		assert.match(
			await vault.read("Mneme/Concepts/Encapsulation-2.md"),
			/^---\nmneme_type: concept\nmneme_id: concept-22222222\nmneme_title: "Encapsulation"\nmneme_version: 1/m,
		);
		assert.match(await vault.read("Mneme/Concepts/Encapsulation-2.md"), /^# Encapsulation$/m);
		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"].linkedConceptIds, [
			"concept-22222222",
		]);
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
				conceptId: "concept-encapsulation",
				proposedCoreMeaning: "Encapsulation hides representation behind a stable interface.",
				proposedSourceLinks: [{
					evidence: [{ excerpt: "Clients depend on the stable interface." }],
					relationType: "update",
					sourceHash: "update-hash",
					sourcePath: "Notes/Interfaces.md",
				}],
				proposedWhyItMatters: "It lets implementations evolve without breaking clients.",
				proposedViews: [{
					body: "Treat the public API as a contract.",
					title: "Contract view",
				}],
			},
			status: "approved",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const sourceRecord = createSourceRecord("Notes/Interfaces.md");
		const storage = new MemoryKnowledgeProposalStorage(createPluginData(
			{ [proposal.id]: proposal },
			{ [sourceRecord.sourcePath]: sourceRecord },
		));
		const vault = new MemoryVaultAdapter({
			[conceptPath]: "# Encapsulation\n\n## Core Meaning\n\nOld meaning.\n\n## Why It Matters\n\nOld reason.\n\n## Views\n\n## Common Traps\n\nKeep this trap.\n\n## Source Notes\n",
		});
		const { store, writer } = await createWriter({ [proposal.id]: proposal }, vault, storage);
		const result = await writer.writeApprovedProposal(proposal.id);
		const markdown = await vault.read(conceptPath);

		assert.equal(result.status, "written");
		assert.match(markdown, /## Core Meaning\n\nEncapsulation hides representation/);
		assert.match(markdown, /## Why It Matters\n\nIt lets implementations evolve/);
		assert.match(markdown, /### Contract view\n\nTreat the public API as a contract\./);
		assert.match(markdown, /\[\[Notes\/Interfaces\]\]/);
		assert.match(markdown, /## Common Traps\n\nKeep this trap\./);
		assert.equal(Object.values(storage.savedData?.conceptSourceLinks ?? {}).length, 1);
		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Interfaces.md"].linkedConceptIds, [
			"concept-encapsulation",
		]);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createApprovedCardProposal();
		const { vault, writer } = await createWriter({ [proposal.id]: proposal });
		await writer.writeApprovedProposal(proposal.id);
		const content = await vault.read("Mneme/Cards/Encapsulation/Cards.md");
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
			"concept-22222222",
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
			"concept-22222222",
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
			linkedConceptIds: ["concept-22222222"],
		};
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }, {
			[sourceRecord.sourcePath]: sourceRecord,
		}));
		const { writer } = await createWriter({ [proposal.id]: proposal }, new MemoryVaultAdapter(), storage);

		await writer.writeApprovedProposal(proposal.id);

		assert.deepEqual(storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath].linkedConceptIds, [
			"concept-22222222",
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
		assert.ok(storage.savedData?.knowledgeProposals[proposal.id]?.writeReceipt);
		assert.equal(storage.savedData?.knowledgeProposals[proposal.id]?.status, "approved");
		assert.deepEqual(storage.savedData?.conceptSourceLinks, {});
		assert.deepEqual(storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"]?.linkedConceptIds, []);
		assert.equal(vault.files.size, 0);
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
		const proposal = createProposal("proposal-reserved-concept", {
			kind: "new_concept",
			payload: { title: "Encapsulation" },
			status: "approved",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new MemoryVaultAdapter();
		const writer = new ApprovedProposalWriter({
		storage,
			conceptIdFactory: createIdSequence("concept"),
			isConceptIdReserved: async (conceptId) => conceptId === "concept-22222222",
			settingsProvider: () => DEFAULT_SETTINGS,
			vaultAdapter: vault,
		});
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, ["Mneme/Concepts/Encapsulation.md"]);
		assert.match(await vault.read("Mneme/Concepts/Encapsulation.md"), /mneme_id: concept-22222223/);
		assert.match(await vault.read("Mneme/Concepts/Encapsulation.md"), /^# Encapsulation$/m);
	}

	{
		const proposal = createProposal("proposal-reserved-bilingual-concept", {
			kind: "new_concept",
			payload: {
				coreMeaning: "间隔效应把学习分散到多个时间点。",
				englishName: "Spacing Effect",
				title: "间隔效应",
			},
			status: "approved",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({ [proposal.id]: proposal }));
		const vault = new MemoryVaultAdapter();
		const writer = new ApprovedProposalWriter({
		storage,
			conceptIdFactory: createIdSequence("concept"),
			isConceptIdReserved: async (conceptId) => conceptId === "concept-22222222",
			settingsProvider: () => ({ ...DEFAULT_SETTINGS, suggestEnglishAliases: true }),
			vaultAdapter: vault,
		});
		const result = await writer.writeApprovedProposal(proposal.id);
		const targetPath = "Mneme/Concepts/间隔效应-(Spacing-Effect).md";
		const markdown = await vault.read(targetPath);

		assert.equal(result.status, "written");
		assert.deepEqual(result.targetPaths, [targetPath]);
		assert.match(markdown, /mneme_id: concept-22222223/);
		assert.match(markdown, /mneme_title: "间隔效应"/);
		assert.match(markdown, /mneme_english_name: "Spacing Effect"/);
		assert.match(markdown, /^# 间隔效应 \(Spacing Effect\)$/m);
		assert.match(markdown, /\|间隔效应 \(Spacing Effect\) Cards\]\]/);
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
		const storage = new FailingCompletionStorage(createPluginData({ [proposal.id]: proposal }, {
			"Notes/Intro.md": createSourceRecord("Notes/Intro.md"),
		}));
		const store = new KnowledgeProposalStore(storage);
		const vault = new MemoryVaultAdapter();
		const writer = new ApprovedProposalWriter({
		storage,
			now: () => "2026-01-02T12:00:00.000Z",
			settingsProvider: () => DEFAULT_SETTINGS,
			vaultAdapter: vault,
		});
		const result = await writer.writeApprovedProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation.md"), true);
		assert.equal((await store.getProposal(proposal.id))?.status, "approved");
	}
}

export const done = runAsyncTests();
