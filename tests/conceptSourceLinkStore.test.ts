import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import {
	createConceptSourceLink,
	createPluginData,
	createProposal,
	createSourceRecord,
	MemoryKnowledgeProposalStorage,
} from "./knowledgeProposalTestUtils";

async function runAsyncTests(): Promise<void> {
	{
		const storage = new MemoryKnowledgeProposalStorage(undefined);
		const store = new ConceptSourceLinkStore(storage);

		assert.deepEqual(await store.loadLinks(), {});
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
				fsrsRequestRetention: 0.85,
			},
			sourceAnalysisRecords: {
				[sourceRecord.sourcePath]: sourceRecord,
			},
		});
		const store = new ConceptSourceLinkStore(storage);
		const link = createConceptSourceLink("link-a");

		await store.upsertLink(link);

		assert.deepEqual(storage.savedData?.conceptSourceLinks[link.id], link);
		assert.equal(storage.savedData?.settings.fsrsRequestRetention, 0.85);
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[proposal.id], "object");
	}

	{
		const firstLink = createConceptSourceLink("link-a", {
			conceptId: "concept-a",
			relationType: "origin",
			sourcePath: "Notes/Intro.md",
			status: "approved",
		});
		const secondLink = createConceptSourceLink("link-b", {
			conceptId: "concept-b",
			relationType: "supporting",
			sourcePath: "Notes/Intro.md",
			status: "suggested",
		});
		const thirdLink = createConceptSourceLink("link-c", {
			conceptId: "concept-a",
			relationType: "example",
			sourcePath: "Notes/Other.md",
			status: "approved",
		});
		const storage = new MemoryKnowledgeProposalStorage(createPluginData({}, {}, {
			[firstLink.id]: firstLink,
			[secondLink.id]: secondLink,
			[thirdLink.id]: thirdLink,
		}));
		const store = new ConceptSourceLinkStore(storage);

		assert.deepEqual(await store.getLink(firstLink.id), firstLink);
		assert.equal((await store.listLinks()).length, 3);
		assert.deepEqual((await store.listApprovedLinks()).map((link) => link.id).sort(), ["link-a", "link-c"]);
		assert.deepEqual((await store.listByConceptId("concept-a")).map((link) => link.id).sort(), ["link-a", "link-c"]);
		assert.deepEqual((await store.listBySourcePath("Notes/Intro.md")).map((link) => link.id).sort(), ["link-a", "link-b"]);
		assert.deepEqual((await store.listByRelationType("supporting")).map((link) => link.id), ["link-b"]);
	}

	{
		const proposal = createProposal("proposal-a");
		const sourceRecord = createSourceRecord("Notes/Intro.md");
		const link = createConceptSourceLink("link-a");
		const storage = new MemoryKnowledgeProposalStorage({
			...createPluginData({ [proposal.id]: proposal }, {
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
		});
		const store = new ConceptSourceLinkStore(storage);

		await store.clearLinks();

		assert.deepEqual(storage.savedData?.conceptSourceLinks, {});
		assert.equal(typeof storage.savedData?.settings, "object");
		assert.equal(typeof storage.savedData?.reviewStates["encapsulation-basic"], "object");
		assert.equal(typeof storage.savedData?.sourceAnalysisRecords[sourceRecord.sourcePath], "object");
		assert.equal(typeof storage.savedData?.knowledgeProposals[proposal.id], "object");
	}
}

export const done = runAsyncTests();
