import assert from "node:assert/strict";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { InboxAcceptanceWorkflow, formatAcceptActionLabel } from "../src/services/inboxAcceptanceWorkflow";
import { filterActiveInboxProposals } from "../src/services/inboxProposalFilters";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createPluginData, createProposal, MemoryKnowledgeProposalStorage } from "./knowledgeProposalTestUtils";

class MemoryVaultAdapter implements MnemeVaultAdapter {
	files = new Map<string, string>();
	createdFolders = new Set<string>();
	shouldFailCreate = false;

	async append(path: string, content: string): Promise<void> {
		this.files.set(path, `${this.files.get(path) ?? ""}${content}`);
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

	async createFolder(path: string): Promise<void> {
		this.createdFolders.add(path);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.createdFolders.has(path);
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

function createWorkflow(proposals = {}, vault = new MemoryVaultAdapter()): {
	store: KnowledgeProposalStore;
	vault: MemoryVaultAdapter;
	workflow: InboxAcceptanceWorkflow;
} {
	const storage = new MemoryKnowledgeProposalStorage(createPluginData(proposals));
	const store = new KnowledgeProposalStore(storage);
	const writer = new ApprovedProposalWriter({
		conceptSourceLinkStore: new ConceptSourceLinkStore(storage),
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
		sourceAnalysisStore: new SourceAnalysisStore(storage),
		vaultAdapter: vault,
	});

	return {
		store,
		vault,
		workflow: new InboxAcceptanceWorkflow({
			proposalStore: store,
			writer,
		}),
	};
}

async function runAsyncTests(): Promise<void> {
	{
		const proposal = createProposal("concept-proposal", {
			kind: "new_concept",
			payload: {
				coreMeaning: "Encapsulation protects internal representation.",
				title: "Encapsulation",
			},
			status: "suggested",
		});
		const { store, vault, workflow } = createWorkflow({ [proposal.id]: proposal });
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "accepted");
		assert.equal(result.kind, "concept");
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
		assert.deepEqual(filterActiveInboxProposals(await store.listProposals()), []);
		assert.equal(vault.files.has("Mneme/Concepts/Encapsulation.md"), true);
		assert.equal(formatAcceptActionLabel(proposal), "Accept Concept");
	}

	{
		const proposal = createProposal("card-proposal", {
			kind: "new_card",
			payload: {
				card: {
					back: "Encapsulation hides representation behind a stable interface.",
					cardType: "application",
					front: "Why does encapsulation help maintainability?",
					rubric: "Mention hidden representation and stable interface.",
				},
				conceptId: "concept-encapsulation",
				conceptTitle: "Encapsulation",
			},
			status: "edited",
		});
		const { store, vault, workflow } = createWorkflow({ [proposal.id]: proposal });
		const result = await workflow.acceptProposal(proposal.id);
		const content = await vault.read("Mneme/Cards/Encapsulation/Encapsulation - Application.md");

		assert.equal(result.status, "accepted");
		assert.equal(result.kind, "card");
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
		assert.deepEqual(filterActiveInboxProposals(await store.listProposals()), []);
		assert.match(content, /MNEME:FRONT:start/);
		assert.equal(content.includes("fsrsState"), false);
		assert.equal(formatAcceptActionLabel(proposal), "Accept Card");
	}

	{
		const proposal = createProposal("invalid-concept", {
			kind: "new_concept",
			payload: {
				title: "",
			},
			status: "suggested",
		});
		const { store, vault, workflow } = createWorkflow({ [proposal.id]: proposal });
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "invalid");
		assert.deepEqual(result.errors, ["New concept title is required."]);
		assert.equal((await store.getProposal(proposal.id))?.status, "suggested");
		assert.equal(vault.files.size, 0);
	}

	{
		const proposal = createProposal("view-proposal", {
			kind: "add_view",
			payload: {
				conceptId: "concept-encapsulation",
				view: {
					body: "A stable interface isolates change.",
					title: "Change boundary",
				},
			},
			status: "suggested",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const vault = new MemoryVaultAdapter();
		vault.files.set(conceptPath, "# Encapsulation\n\n## Views\n");
		const { store, workflow } = createWorkflow({ [proposal.id]: proposal }, vault);
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "accepted");
		assert.equal(result.kind, "concept");
		assert.equal(formatAcceptActionLabel(proposal), "Accept View");
		assert.match(await vault.read(conceptPath), /### Change boundary\n\nA stable interface isolates change\./);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("source-link-proposal", {
			kind: "link_existing_concept",
			payload: {
				proposedSourceLink: {
					relationType: "origin",
					sourcePath: "Notes/Lecture 1.md",
				},
				targetConceptId: "concept-encapsulation",
			},
			status: "suggested",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const vault = new MemoryVaultAdapter();
		vault.files.set(conceptPath, "# Encapsulation\n\n## Source Notes\n");
		const { store, workflow } = createWorkflow({ [proposal.id]: proposal }, vault);
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "accepted");
		assert.equal(result.kind, "concept");
		assert.equal(formatAcceptActionLabel(proposal), "Accept Source Link");
		assert.match(await vault.read(conceptPath), /\[\[Notes\/Lecture 1\]\]/);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("failing-concept", {
			kind: "new_concept",
			payload: {
				title: "Encapsulation",
			},
			status: "suggested",
		});
		const vault = new MemoryVaultAdapter();
		vault.shouldFailCreate = true;
		const { store, workflow } = createWorkflow({ [proposal.id]: proposal }, vault);
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "failed");
		assert.equal((await store.getProposal(proposal.id))?.status, "stale");
	}

	{
		const proposal = createProposal("concept-update", {
			kind: "update_concept",
			payload: {
				conceptId: "concept-encapsulation",
				proposedSummary: "Updated summary",
			},
			status: "suggested",
		});
		const conceptPath = "Mneme/Concepts/Encapsulation/Concept.md";
		const vault = new MemoryVaultAdapter();
		vault.files.set(conceptPath, "# Encapsulation\n\n## Why It Matters\n\nOld summary.\n");
		const { store, workflow } = createWorkflow({ [proposal.id]: proposal }, vault);
		const result = await workflow.acceptProposal(proposal.id);

		assert.equal(result.status, "accepted");
		assert.equal(result.kind, "concept");
		assert.equal(formatAcceptActionLabel(proposal), "Accept Update");
		assert.match(await vault.read(conceptPath), /## Why It Matters\n\nUpdated summary/);
		assert.equal((await store.getProposal(proposal.id))?.status, "written");
	}

	{
		const proposal = createProposal("reject-me", {
			status: "stale",
		});
		const { store, workflow } = createWorkflow({ [proposal.id]: proposal });
		const result = await workflow.rejectProposal(proposal.id);

		assert.equal(result.status, "accepted");
		assert.equal((await store.getProposal(proposal.id))?.status, "rejected");
		assert.deepEqual(filterActiveInboxProposals(await store.listProposals()), []);
	}
}

export const done = runAsyncTests();
