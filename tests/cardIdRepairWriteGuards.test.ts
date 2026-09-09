import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import type { PluginDataStorage } from "../src/services/pluginDataMutation";
import { createEmptyManualCardDraft } from "../src/models/manualCardDraft";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createDefaultPluginData, normalizePluginData } from "../src/services/reviewStateStore";
import { createManualCardWithRecovery } from "../src/services/manualCardWriteService";
import type { ManualCardVault } from "../src/services/manualCardService";
import { ApprovedProposalWriter, type MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { createProposal } from "./knowledgeProposalTestUtils";

class Storage implements PluginDataStorage {
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> { this.data = structuredClone(data); }
}

class Vault implements ManualCardVault {
	files = new Map<string, string>();
	async create(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async createFolder(_path: string): Promise<void> {}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.files.set(path, transform(this.files.get(path) ?? ""));
	}
	async read(path: string): Promise<string> { return this.files.get(path) ?? ""; }
}

class ApprovedVault implements MnemeVaultAdapter {
	files = new Map<string, string>();
	async append(path: string, content: string): Promise<void> { this.files.set(path, `${this.files.get(path) ?? ""}${content}`); }
	async create(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async createFolder(_path: string): Promise<void> {}
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async modify(path: string, content: string): Promise<void> { this.files.set(path, content); }
	async process(path: string, transform: (current: string) => string): Promise<void> { this.files.set(path, transform(this.files.get(path) ?? "")); }
	async read(path: string): Promise<string> { return this.files.get(path) ?? ""; }
}

const concept = {
	conceptId: "concept-repair-guards",
	path: "Mneme/Concepts/Repair.md",
	title: "Repair",
	cardsPath: "Mneme/Cards/Repair/Cards.md",
};

function receipt(status: "pending" | "completed", newCardId: string, migrateState = false) {
	return {
		version: 1 as const, status, oldCardId: "legacy-card-001", newCardId,
		path: concept.cardsPath, cardIndex: 0, migrateState,
		beforeHash: "a".repeat(64), afterHash: "b".repeat(64),
		createdAt: "2026-09-09T00:00:00.000Z",
	};
}

async function run(): Promise<void> {
	const draft = {
		...createEmptyManualCardDraft(concept.conceptId, "2026-09-09T00:00:00.000Z"),
		front: "A repair guarded card",
		back: "Answer",
		cardType: "definition" as const,
	};

	{
		const data = createDefaultPluginData();
		data.manualCardDraft = draft;
		data.manualCardDraftId = draft.draftId;
		data.cardIdRepairs = { "repair-new-001": receipt("pending", "repair-new-001") };
		const storage = new Storage(normalizePluginData(data));
		const vault = new Vault();
		await assert.rejects(
			createManualCardWithRecovery(draft, concept, DEFAULT_SETTINGS, vault, storage, new Set(), () => "fresh-card-001"),
			/path|repair|Resume/i,
		);
		assert.equal(vault.files.size, 0);
	}

	{
		const data = createDefaultPluginData();
		data.manualCardDraft = draft;
		data.manualCardDraftId = draft.draftId;
		data.cardIdRepairs = { "repair-new-002": receipt("completed", "repair-new-002") };
		const storage = new Storage(normalizePluginData(data));
		const vault = new Vault();
		const result = await createManualCardWithRecovery(
			draft, concept, DEFAULT_SETTINGS, vault, storage, new Set(),
			(() => { let i = 0; return () => (++i === 1 ? "repair-new-002" : "fresh-card-002"); })(),
		);
		assert.equal(result.cardId, "fresh-card-002");
	}

	for (const repairStatus of ["pending", "completed"] as const) {
		const proposal = createProposal(`proposal-repair-${repairStatus}`, {
			kind: "new_card",
			payload: {
				card: { back: "Answer", cardType: "definition", front: "What is guarded?", rubric: "Mention repair guards." },
				conceptId: concept.conceptId, conceptTitle: concept.title,
			},
			status: "approved",
		});
		const data = createDefaultPluginData();
		data.knowledgeProposals = { [proposal.id]: proposal };
		data.cardIdRepairs = { "repair-new-003": receipt(repairStatus, "repair-new-003") };
		const storage = new Storage(normalizePluginData(data));
		const vault = new ApprovedVault();
		let calls = 0;
		const writer = new ApprovedProposalWriter({
			storage,
			cardIdFactory: () => (++calls === 1 ? "repair-new-003" : "approved-card-003"),
			conceptScanner: { scanConcepts: async () => [concept] },
			now: () => "2026-09-09T00:00:00.000Z",
			settingsProvider: () => DEFAULT_SETTINGS,
			vaultAdapter: vault,
		});
		const result = await writer.writeApprovedProposal(proposal.id);
		if (repairStatus === "pending") {
			assert.equal(result.status, "failed");
			assert.match(result.message, /repair|changing|Resume/i);
			assert.equal(vault.files.size, 0);
		} else {
			assert.equal(result.status, "written");
			assert.equal(calls, 2);
			assert.match([...vault.files.values()][0] ?? "", /approved-card-003/);
		}
	}
}

export const done = run().then(() => console.log("Card ID repair write guard tests passed."));
