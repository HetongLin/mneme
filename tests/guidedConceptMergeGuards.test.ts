import assert from "node:assert/strict";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import { ReviewStateStore, createDefaultPluginData } from "../src/services/reviewStateStore";
import { assertGuidedMergeAllowsTarget, getPendingGuidedConceptMerge, readGuidedConceptMergeReceipt } from "../src/services/guidedConceptMergeRecovery";
import { assertMergeHasNoPendingWrites } from "../src/services/mergePendingWrites";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { RecoverableCardDeletion } from "../src/services/recoverableCardDeletion";
import { RecoverableCardIdRepair } from "../src/services/recoverableCardIdRepair";
import { createManualCardWithRecovery } from "../src/services/manualCardWriteService";
import { RecoverableConceptDeletion } from "../src/services/recoverableConceptDeletion";
import { RecoverableConceptIdRepair } from "../src/services/recoverableConceptIdRepair";
import { DEFAULT_SETTINGS } from "../src/models/settings";

const stamp = "2026-09-23T10:00:00.000Z";
const hash = (char: string) => char.repeat(64);
const guidedReceipt = {
	version: 1 as const,
	operationId: "guided-op",
	status: "pending" as const,
	createdAt: stamp,
	survivor: { conceptId: "concept-survivor", path: "Concepts/Survivor.md" },
	merged: { conceptId: "concept-merged", path: "Concepts/Merged.md" },
	protectedPaths: ["Concepts/Survivor.md", "Concepts/Merged.md", "Cards.md"],
	cardIds: ["card-merged"],
	writes: [
		{ path: "Concepts/Survivor.md", beforeHash: hash("a"), afterHash: hash("b") },
		{ path: "Concepts/Merged.md", beforeHash: hash("c"), afterHash: hash("d") },
	],
	journalHash: hash("e"),
	sourceLinksHash: hash("f"),
};

class Storage {
	saved = 0;
	constructor(public data = createDefaultPluginData()) {}
	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: typeof this.data): Promise<void> { this.saved++; this.data = data; }
}

function sourceLink(id: string, conceptId: string, sourcePath = "Notes/Source.md") {
	return { id, conceptId, sourcePath, addedAt: stamp, lastSeenAt: stamp, sourceHash: hash("1"), status: "approved" as const, relationType: "origin" as const, evidence: [] };
}

function proposal(id: string, conceptId: string): KnowledgeProposal {
	return { id, kind: "add_view", conceptId, status: "suggested", createdAt: stamp, updatedAt: stamp,
		payload: { conceptId, view: { title: "View", body: "body" } } };
}

async function run(): Promise<void> {
	const data = createDefaultPluginData();
	data.guidedConceptMerge = guidedReceipt;
	assert.equal(getPendingGuidedConceptMerge(data)?.operationId, "guided-op");
	assert.throws(() => assertGuidedMergeAllowsTarget(data, ["Concepts/Merged.md"]), /Resume Guided Merge/);
	assert.throws(() => assertGuidedMergeAllowsTarget(data, [], ["concept-survivor"]), /Resume Guided Merge/);
	assert.throws(() => assertGuidedMergeAllowsTarget(data, [], [], ["card-merged"]), /Resume Guided Merge/);
	assert.doesNotThrow(() => assertGuidedMergeAllowsTarget(data, ["Notes/Other.md"], ["concept-other"], ["card-other"]));
	assert.throws(() => assertMergeHasNoPendingWrites(data, ["Concepts/Merged.md"]), /Resume Guided Merge/);

	const malformed = createDefaultPluginData();
	malformed.guidedConceptMerge = { version: 1, status: "pending" } as never;
	assert.throws(() => getPendingGuidedConceptMerge(malformed), /Guided Merge recovery record is invalid/);
	assert.throws(() => readGuidedConceptMergeReceipt(malformed.guidedConceptMerge), /Guided Merge recovery record is invalid/);

	const linksData = createDefaultPluginData();
	linksData.guidedConceptMerge = guidedReceipt;
	linksData.conceptSourceLinks.old = sourceLink("old", "concept-merged");
	const linksStorage = new Storage(linksData);
	const links = new ConceptSourceLinkStore(linksStorage);
	await assert.rejects(() => links.upsertLink(sourceLink("old", "concept-other")), /Resume Guided Merge/);
	assert.equal(linksStorage.saved, 0);
	const reconciled = await links.reconcileLinksIfUnchanged([{ expected: linksData.conceptSourceLinks.old!, action: "remove_missing_concept" }]);
	assert.deepEqual(reconciled.deferredLinkIds, ["old"]);
	assert.deepEqual(reconciled.removedLinks, []);
	await assert.rejects(() => links.clearLinks(), /Resume Guided Merge/);
	assert.equal(linksStorage.saved, 0);

	const analysisData = createDefaultPluginData();
	analysisData.guidedConceptMerge = guidedReceipt;
	analysisData.conceptSourceLinks.link = sourceLink("link", "concept-merged", "Notes/Protected.md");
	const analysisStorage = new Storage(analysisData);
	const analysis = new SourceAnalysisStore(analysisStorage);
	const record = { sourcePath: "Notes/Protected.md", linkedConceptIds: [], pendingProposalIds: [], lastAnalyzedAt: stamp, contentHash: "hash", mtime: 1, size: 1, status: "clean" as const };
	assert.deepEqual(await analysis.reconcileRecordsIfUnchanged([{ record, sourceExists: false }]), []);
	assert.ok(analysisStorage.data.sourceAnalysisRecords[record.sourcePath] === undefined);
	// The record was never saved in this fixture; verify a saved record is preserved.
	await analysis.upsertRecord(record);
	assert.deepEqual(await analysis.reconcileRecordsIfUnchanged([{ record, sourceExists: false }]), []);
	assert.deepEqual(analysisStorage.data.sourceAnalysisRecords[record.sourcePath], record);

	const proposalData = createDefaultPluginData();
	proposalData.guidedConceptMerge = guidedReceipt;
	proposalData.knowledgeProposals.proposal = proposal("proposal", "concept-merged");
	const proposalStorage = new Storage(proposalData);
	const proposals = new KnowledgeProposalStore(proposalStorage);
	await assert.rejects(() => proposals.upsertProposal({ ...proposalData.knowledgeProposals.proposal!, updatedAt: "2026-09-23T11:00:00.000Z" }), /merged Concept/);
	assert.equal(proposalStorage.saved, 0);
	await proposals.upsertProposal(proposalData.knowledgeProposals.proposal);

	const writerData = createDefaultPluginData();
	writerData.guidedConceptMerge = guidedReceipt;
	writerData.knowledgeProposals.proposal = { ...proposal("proposal", "concept-merged"), status: "approved" };
	const writer = new ApprovedProposalWriter({ storage: new Storage(writerData), settingsProvider: () => DEFAULT_SETTINGS, vaultAdapter: {} as never });
	const result = await writer.writeApprovedProposal("proposal");
	assert.equal(result.status, "failed");
	assert.match(result.message ?? "", /Resume Guided Merge/);

	const rekeyStorage = new Storage(data);
	const reviews = new ReviewStateStore(rekeyStorage, {} as never);
	await assert.rejects(() => reviews.rekeyCard("card-merged", "card-other"), /Resume Guided Merge/);
	assert.equal(rekeyStorage.saved, 0);
	// A persisted write may bind the protected path without a top-level Concept ID.
	const pendingProposal = { ...proposal("receipt-proposal", "concept-other"), conceptId: undefined, status: "approved" as const,
		writeReceipt: { version: 1 as const, mode: "modify" as const, targetPath: "Concepts/Merged.md", proposalHash: hash("a"), beforeHash: hash("b"), afterHash: hash("c"), createdAt: stamp } };
	writerData.knowledgeProposals[pendingProposal.id] = pendingProposal;
	const retry = await writer.writeApprovedProposal(pendingProposal.id);
	assert.equal(retry.status, "failed");
	assert.match(retry.message, /Resume Guided Merge/);

	const cardData = createDefaultPluginData(); cardData.guidedConceptMerge = guidedReceipt;
	cardData.cardDeletion = { version: 1, cardId: "card-merged", path: "Cards.md", beforeHash: hash("a"), afterHash: hash("b"), createdAt: stamp };
	const cardStorage = new Storage(cardData);
	await assert.rejects(() => new RecoverableCardDeletion({} as never, cardStorage).resume(), /Resume Guided Merge/);
	assert.equal(cardStorage.saved, 0);
	const repairCardData = createDefaultPluginData(); repairCardData.guidedConceptMerge = guidedReceipt;
	repairCardData.cardIdRepairs = { "new-card": { version: 1, status: "pending", oldCardId: "card-merged", newCardId: "new-card", path: "Cards.md", cardIndex: 0, migrateState: false, beforeHash: hash("a"), afterHash: hash("b"), createdAt: stamp } };
	const repairCardStorage = new Storage(repairCardData);
	await assert.rejects(() => new RecoverableCardIdRepair({} as never, repairCardStorage).resume(), /Resume Guided Merge/);
	assert.equal(repairCardStorage.saved, 0);
	const manualStorage = new Storage(data);
	await assert.rejects(() => createManualCardWithRecovery({ draftId: "draft", conceptId: "concept-merged", front: "Front", back: "Back", rubric: "", cardType: "definition", updatedAt: stamp }, undefined, DEFAULT_SETTINGS, {} as never, manualStorage), /Resume Guided Merge/);
	assert.equal(manualStorage.saved, 0);

	const deletionData = createDefaultPluginData();
	deletionData.guidedConceptMerge = guidedReceipt;
	deletionData.conceptDeletions = { "concept-merged": { version: 1, status: "pending", operationId: "delete-op", conceptId: "concept-merged", createdAt: stamp, conceptPath: "Concepts/Merged.md", cardIds: [], files: [{ path: "Concepts/Merged.md", stagePath: "Concepts/Merged.md.mneme-delete-delete-op", hash: hash("a"), phase: "planned" }], related: [] } };
	await assert.rejects(() => new RecoverableConceptDeletion({} as never, new Storage(deletionData)).resume(), /Resume Guided Merge/);

	const repairData = createDefaultPluginData();
	repairData.guidedConceptMerge = guidedReceipt;
	repairData.conceptIdRepairs = { "new-concept": { version: 1, status: "pending", newConceptId: "new-concept", concept: { path: "Concepts/Merged.md", beforeHash: hash("a"), afterHash: hash("b") }, migrateState: false, createdAt: stamp } };
	await assert.rejects(() => new RecoverableConceptIdRepair({} as never, new Storage(repairData)).resume(), /Resume Guided Merge/);
}

export const done = run();
