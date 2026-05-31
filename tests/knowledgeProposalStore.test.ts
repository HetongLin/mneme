import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import {
	MemoryKnowledgeProposalStorage,
	createConceptSourceLink,
	createPluginData,
	createProposal,
	createSourceRecord,
} from "./knowledgeProposalTestUtils";

async function runAsyncTests(): Promise<void> {
	{
		const storage = new MemoryKnowledgeProposalStorage(undefined);
		const store = new KnowledgeProposalStore(storage);

		assert.deepEqual(await store.loadProposals(), {});
	}

	{
		const storage = new MemoryKnowledgeProposalStorage({
			conceptSourceLinks: {
				"link-a": createConceptSourceLink("link-a"),
			},
			reviewStates: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					createdAt: "2026-01-01T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 1,
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			schemaVersion: 1,
			settings: {
				...DEFAULT_SETTINGS,
				fsrsRequestRetention: 0.85,
			},
			sourceAnalysisRecords: {
				"Notes/Intro.md": createSourceRecord("Notes/Intro.md"),
			},
		});
		const store = new KnowledgeProposalStore(storage);
		const proposal = createProposal("proposal-a", {
			sourcePath: "Notes/Intro.md",
		});

		await store.upsertProposal(proposal);

		assert.deepEqual(storage.savedData?.knowledgeProposals["proposal-a"], proposal);
		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.conceptSourceLinks["link-a"], "object");
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords["Notes/Intro.md"], "object");
	}

	{
		const firstProposal = createProposal("proposal-a", {
			sourcePath: "Notes/Intro.md",
			status: "suggested",
		});
		const secondProposal = createProposal("proposal-b", {
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const thirdProposal = createProposal("proposal-c", {
			sourcePath: "Notes/Other.md",
			status: "stale",
		});
		const openedProposal = createProposal("proposal-d", {
			status: "opened",
		});
		const editedProposal = createProposal("proposal-e", {
			status: "edited",
		});
		const rejectedProposal = createProposal("proposal-f", {
			status: "rejected",
		});
		const writtenProposal = createProposal("proposal-g", {
			status: "written",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[firstProposal.id]: firstProposal,
			[secondProposal.id]: secondProposal,
			[thirdProposal.id]: thirdProposal,
			[openedProposal.id]: openedProposal,
			[editedProposal.id]: editedProposal,
			[rejectedProposal.id]: rejectedProposal,
			[writtenProposal.id]: writtenProposal,
		}));
		const store = new KnowledgeProposalStore(storage);

		assert.deepEqual(await store.getProposal(firstProposal.id), firstProposal);
		assert.equal((await store.listProposals()).length, 7);
		assert.deepEqual((await store.listPending()).map((proposal) => proposal.id).sort(), [
			"proposal-a",
			"proposal-c",
			"proposal-d",
			"proposal-e",
		]);
		assert.deepEqual(await store.listByStatus("approved"), [secondProposal]);
		assert.deepEqual((await store.listBySourcePath("Notes/Intro.md")).map((proposal) => proposal.id), [
			"proposal-a",
			"proposal-b",
		]);
	}

	{
		const proposal = createProposal("proposal-a", {
			payload: {
				summary: "A test concept",
				title: "Encapsulation",
			},
			status: "suggested",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[proposal.id]: proposal,
		}));
		const store = new KnowledgeProposalStore(storage);

		const updatedProposal = await store.updateProposalStatus(
			proposal.id,
			"opened",
			"2026-01-02T12:00:00.000Z",
		);

		assert.equal(updatedProposal.status, "opened");
		assert.deepEqual(updatedProposal.payload, proposal.payload);
		assert.equal(updatedProposal.updatedAt, "2026-01-02T12:00:00.000Z");
		assert.equal(storage.savedData?.knowledgeProposals[proposal.id].status, "opened");
	}

	{
		const legacyProposal = createProposal("legacy-proposal", {
			payload: undefined,
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({
			[legacyProposal.id]: legacyProposal,
		}));
		const store = new KnowledgeProposalStore(storage);

		assert.deepEqual(await store.getProposal(legacyProposal.id), legacyProposal);
	}

	{
		const proposal = createProposal("proposal-a");
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const storage = new MemoryKnowledgeProposalStorage({
			knowledgeProposals: {
				[proposal.id]: proposal,
			},
			reviewStates: {
				"encapsulation-basic": {
					cardId: "encapsulation-basic",
					createdAt: "2026-01-01T12:00:00.000Z",
					lapseCount: 0,
					reviewCount: 1,
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			},
			schemaVersion: 1,
			settings: {
				...DEFAULT_SETTINGS,
				fsrsEnableFuzz: true,
			},
			sourceAnalysisRecords: {
				[sourceRecord.sourcePath]: sourceRecord,
			},
		});
		const store = new KnowledgeProposalStore(storage);

		await store.clearProposals();

		assert.deepEqual(storage.savedData?.knowledgeProposals, {});
		assert.equal(storage.savedData?.settings.fsrsEnableFuzz, true);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
	}
}

export const done = runAsyncTests();
