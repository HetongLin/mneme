import assert from "node:assert/strict";
import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { ManualConceptDraftStore } from "../src/services/manualConceptDraftStore";
import { ConceptConflictMergeDraftStore } from "../src/services/conceptConflictMergeDraftStore";
import { assertMergeHasNoPendingWrites } from "../src/services/mergePendingWrites";
import {
	assertIncomingMergeAllowsOrigin,
	assertIncomingMergeAllowsTarget,
	getPendingIncomingConceptMerge,
	readIncomingConceptMergeReceipt,
} from "../src/services/incomingConceptMergeRecovery";
import type { IncomingConceptMergeReceipt } from "../src/services/incomingConceptMergeRecovery";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import type { MnemePluginData } from "../src/models/reviewState";
import { createManualConceptWithRecovery } from "../src/services/manualConceptWriteService";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { RecoverableConceptDeletion } from "../src/services/recoverableConceptDeletion";
import { RecoverableConceptIdRepair } from "../src/services/recoverableConceptIdRepair";
import { DEFAULT_SETTINGS } from "../src/models/settings";

const receipt = {
	version: 1 as const,
	status: "pending" as const,
	operationId: "merge-op",
	conceptId: "concept-1",
	path: "Mneme/Concepts/One.md",
	beforeHash: "a".repeat(64),
	afterHash: "b".repeat(64),
	createdAt: "2026-09-23T10:00:00.000Z",
	origin: { kind: "inbox" as const, proposalId: "proposal-1", inputHash: "c".repeat(64) },
};

class Storage {
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: MnemePluginData): Promise<void> { this.data = data; }
}

function proposal(status: KnowledgeProposal["status"] = "edited"): KnowledgeProposal {
	return {
		id: "proposal-1", kind: "new_concept", status, createdAt: receipt.createdAt, updatedAt: receipt.createdAt,
		sourcePath: "Notes/Source.md", sourceHash: "source", evidence: [{ excerpt: "evidence" }],
		payload: { title: "One", coreMeaning: "meaning", whyItMatters: "why", tags: [], proposedViews: [], proposedSourceLinks: [] },
	};
}

async function run(): Promise<void> {
	const data = createDefaultPluginData();
	data.incomingConceptMerge = receipt;
	data.knowledgeProposals[receipt.origin.proposalId] = proposal();
	const storage = new Storage(data);
	const proposals = new KnowledgeProposalStore(storage);

	assert.equal(getPendingIncomingConceptMerge(data)?.operationId, receipt.operationId);
	assert.throws(() => assertIncomingMergeAllowsOrigin(data, { kind: "inbox", proposalId: receipt.origin.proposalId }), /Run Resume Incoming Concept Merge/);
	assert.doesNotThrow(() => assertIncomingMergeAllowsOrigin(data, { kind: "inbox", proposalId: "other" }));
	assert.throws(() => assertIncomingMergeAllowsTarget(data, [receipt.path], []), /Run Resume Incoming Concept Merge/);
	assert.throws(() => assertIncomingMergeAllowsTarget(data, [], [receipt.conceptId]), /Run Resume Incoming Concept Merge/);
	assert.doesNotThrow(() => assertIncomingMergeAllowsTarget(data, ["Mneme/Concepts/Other.md"], ["other"]));
	assert.throws(() => assertMergeHasNoPendingWrites(data, [receipt.path]), /Run Resume Incoming Concept Merge/);

	const unchanged = proposal();
	await proposals.upsertProposal(unchanged);
	assert.deepEqual((await proposals.getProposal(unchanged.id))?.updatedAt, unchanged.updatedAt);
	await assert.rejects(() => proposals.upsertProposal({ ...unchanged, updatedAt: "2026-09-23T11:00:00.000Z" }), /Resume .*Incoming Concept Merge/);
	assert.deepEqual(await proposals.removeProposalsIfUnchanged([unchanged]), []);
	await assert.rejects(() => proposals.clearProposals(), /Resume .*Incoming Concept Merge/);
	await assert.rejects(() => proposals.updateProposalStatus(receipt.origin.proposalId, "rejected"), /Resume .*Incoming Concept Merge/);
	const writtenData = createDefaultPluginData();
	writtenData.knowledgeProposals["written-proposal"] = { ...proposal("written"), id: "written-proposal", writeReceipt: {
		version: 1, proposalHash: "d".repeat(64), targetPath: "Written.md", mode: "modify", beforeHash: "e".repeat(64), afterHash: "f".repeat(64), createdAt: receipt.createdAt,
	} };
	const writtenStore = new KnowledgeProposalStore(new Storage(writtenData));
	await assert.rejects(() => writtenStore.updateProposalStatus("written-proposal", "rejected"), /pending write receipt|completed or pending Markdown recovery/);
	await assert.rejects(() => proposals.replaceProposals({}), /Resume .*Incoming Concept Merge/);
	await proposals.replaceProposals({ ...storage.data.knowledgeProposals });

	const manualData = createDefaultPluginData();
	manualData.incomingConceptMerge = { ...receipt, origin: { kind: "manual", inputHash: "c".repeat(64) } };
	const manualStorage = new Storage(manualData);
	const drafts = new ManualConceptDraftStore(manualStorage);
	await assert.rejects(() => drafts.getState(), /Run Resume Incoming Concept Merge/);
	const protectedDraft = { draftId: "manual-1", title: "Preserve", coreMeaning: "Meaning", englishName: "", whyItMatters: "", importance: "normal" as const, learningMode: "reviewable" as const, tags: [], updatedAt: receipt.createdAt };
	await assert.rejects(() => drafts.saveDraft(protectedDraft), /Run Resume Incoming Concept Merge/);
	await assert.rejects(() => drafts.clearDraft(protectedDraft.draftId), /Run Resume Incoming Concept Merge/);
	const conflict = new ConceptConflictMergeDraftStore(manualStorage);
	await assert.rejects(() => conflict.clearDraft("manual"), /Run Resume Incoming Concept Merge/);
	await assert.rejects(() => conflict.saveDraft({ key: "manual", draft: { coreMeaning: "", englishName: "", importance: "normal", learningMode: "reviewable", tags: [], title: "", whyItMatters: "" }, existingConceptId: "concept-1", incomingFingerprint: "fingerprint", updatedAt: receipt.createdAt }), /Run Resume Incoming Concept Merge/);
	const unrelatedConflict = new ConceptConflictMergeDraftStore(new Storage(createDefaultPluginData()));
	await unrelatedConflict.clearDraft("manual");
	await testActualServiceGuards();

	const malformed = createDefaultPluginData();
	malformed.incomingConceptMerge = { version: 1, status: "pending" } as unknown as IncomingConceptMergeReceipt;
	assert.throws(() => getPendingIncomingConceptMerge(malformed), /saved Incoming Concept Merge record is invalid/);
	assert.throws(() => readIncomingConceptMergeReceipt(malformed.incomingConceptMerge as unknown as IncomingConceptMergeReceipt), /saved Incoming Concept Merge record is invalid/);
}

async function testActualServiceGuards(): Promise<void> {
	const manualData = createDefaultPluginData();
	manualData.incomingConceptMerge = { ...receipt, origin: { kind: "manual", inputHash: "c".repeat(64) } };
	const manualStorage = new Storage(manualData);
	const draft = { draftId: "draft-1", updatedAt: receipt.createdAt, title: "Title", englishName: "", coreMeaning: "Meaning", whyItMatters: "Why", importance: "normal" as const, learningMode: "reviewable" as const, tags: [] };
	let writes = 0;
	await assert.rejects(() => createManualConceptWithRecovery(draft, DEFAULT_SETTINGS, { read: async () => "", exists: async () => false, create: async () => { writes += 1; }, createFolder: async () => {}, process: async () => {}, modify: async () => {}, append: async () => {} } as never, manualStorage), /Run Resume Incoming Concept Merge/);
	assert.equal(writes, 0);

	const sourceData = createDefaultPluginData();
	sourceData.incomingConceptMerge = receipt;
	sourceData.knowledgeProposals[receipt.origin.proposalId] = { ...proposal("approved"), writeReceipt: {
		version: 1, proposalHash: "d".repeat(64), targetPath: "Other.md", mode: "modify", beforeHash: "e".repeat(64), afterHash: "f".repeat(64), createdAt: receipt.createdAt,
	} };
	const sourceWriter = new ApprovedProposalWriter({ storage: new Storage(sourceData), settingsProvider: () => DEFAULT_SETTINGS, vaultAdapter: {} as never });
	const sourceResult = await sourceWriter.writeApprovedProposal(receipt.origin.proposalId);
	assert.equal(sourceResult.status, "failed");
	assert.match(sourceResult.message ?? "", /Run Resume Incoming Concept Merge/);

	const targetData = createDefaultPluginData();
	targetData.incomingConceptMerge = receipt;
	const targetProposal: KnowledgeProposal = { ...proposal("approved"), id: "other-proposal", writeReceipt: {
		version: 1, proposalHash: "d".repeat(64), targetPath: receipt.path, mode: "modify" as const, beforeHash: "e".repeat(64), afterHash: "f".repeat(64), createdAt: receipt.createdAt,
	} };
	targetData.knowledgeProposals[targetProposal.id] = targetProposal;
	const targetWriter = new ApprovedProposalWriter({ storage: new Storage(targetData), settingsProvider: () => DEFAULT_SETTINGS, vaultAdapter: {} as never });
	const targetResult = await targetWriter.writeApprovedProposal(targetProposal.id);
	assert.equal(targetResult.status, "failed");
	assert.match(targetResult.message ?? "", /Run Resume Incoming Concept Merge/);

	const deletionData = createDefaultPluginData();
	deletionData.incomingConceptMerge = receipt;
	deletionData.conceptDeletions = { [receipt.conceptId]: { version: 1, status: "pending", operationId: "delete-1", conceptId: receipt.conceptId, createdAt: receipt.createdAt, conceptPath: receipt.path, cardIds: [], files: [{ path: receipt.path, stagePath: `${receipt.path}.mneme-delete-delete-1`, hash: "a".repeat(64), phase: "planned" }], related: [] } };
	await assert.rejects(() => new RecoverableConceptDeletion({} as never, new Storage(deletionData)).resume(), /Run Resume Incoming Concept Merge/);

	const repairData = createDefaultPluginData();
	repairData.incomingConceptMerge = receipt;
	repairData.conceptIdRepairs = { "new-concept": { version: 1, status: "pending", newConceptId: "new-concept", concept: { path: receipt.path, beforeHash: "a".repeat(64), afterHash: "b".repeat(64) }, migrateState: false, createdAt: receipt.createdAt } };
	await assert.rejects(() => new RecoverableConceptIdRepair({} as never, new Storage(repairData)).resume(), /Run Resume Incoming Concept Merge/);
}

export const done = run();
