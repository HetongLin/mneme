import assert from "node:assert/strict";
import type { ConceptIdentityIssue, ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { RecoverableConceptIdRepair } from "../src/services/recoverableConceptIdRepair";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { VaultStateReconciler } from "../src/services/vaultStateReconciler";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

const conceptPath = "Mneme/Concepts/A.md";
const cardsPath = "Mneme/Cards/A.md";
const sourcePath = "Notes/A.md";
const conceptMarkdown = `---\nmneme_type: concept\ncards: ${cardsPath}\n---\n# A\n`;
const cardsMarkdown = `---\nmneme_type: card_group\nmneme_concept_id: orphan-id\n---\n`;
const issue: ConceptIdentityIssue = { kind: "missing_id", path: conceptPath, cardsPath, title: "A" };

class Storage {
	constructor(public data: MnemePluginData = createDefaultPluginData()) {}
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> { this.data = structuredClone(data); }
}

class Vault {
	files = new Map<string, string>([[conceptPath, conceptMarkdown], [cardsPath, cardsMarkdown], [sourcePath, "source"]]);
	async exists(path: string): Promise<boolean> { return this.files.has(path); }
	async listMarkdownFiles(): Promise<Array<{ path: string }>> { return [...this.files.keys()].map((path) => ({ path })); }
	async readFresh(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing ${path}`);
		return content;
	}
	parseFrontmatter(markdown: string): unknown {
		const result: Record<string, string> = {};
		const match = markdown.match(/^---\n([\s\S]*?)\n---/);
		for (const line of (match?.[1] ?? "").split("\n")) {
			const pair = line.match(/^([^:#]+):\s*(.*)$/);
			if (pair) result[pair[1]!.trim()] = pair[2]!.trim();
		}
		return result;
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.files.set(path, transform(await this.readFresh(path)));
	}
}

function link(id: string, conceptId: string) {
	return {
		id, conceptId, sourcePath,
		relationType: "origin" as const,
		status: "approved" as const,
		sourceHash: "source-hash",
		addedAt: "2026-01-01T00:00:00.000Z",
		lastSeenAt: "2026-01-01T00:00:00.000Z",
		evidence: [{ excerpt: "evidence", heading: "A", lineStart: 1, lineEnd: 2 }],
	};
}

function reconciler(storage: Storage, vault: Vault, scanConcepts: () => Promise<ConceptSummary[]>) {
	return new VaultStateReconciler({
		vault,
		conceptScanner: { scanConcepts },
		conceptSourceLinkStore: new ConceptSourceLinkStore(storage),
		knowledgeProposalStore: new KnowledgeProposalStore(storage),
		sourceAnalysisStore: new SourceAnalysisStore(storage),
	});
}

const summary: ConceptSummary = { conceptId: "new-id", path: conceptPath, title: "A", cardsPath };

async function run(): Promise<void> {
	const storage = new Storage();
	storage.data.conceptSourceLinks = { old: link("old", "orphan-id") };
	storage.data.sourceAnalysisRecords[sourcePath] = {
		sourcePath, contentHash: "source-hash", mtime: 1, size: 1,
		lastAnalyzedAt: "2026-01-01T00:00:00.000Z",
		linkedConceptIds: ["orphan-id"], pendingProposalIds: [], status: "clean",
	};
	const beforeLinks = structuredClone(storage.data.conceptSourceLinks);
	const beforeSources = structuredClone(storage.data.sourceAnalysisRecords);
	const vault = new Vault();
	await new RecoverableConceptIdRepair(vault, storage).repair(issue, "new-id");
	const result = await reconciler(storage, vault, async () => [summary]).reconcile();
	assert.deepEqual(storage.data.conceptSourceLinks, beforeLinks);
	assert.deepEqual(storage.data.sourceAnalysisRecords, beforeSources);
	assert.ok(result.deferredConceptSourceLinkIds.includes("old"));
	assert.equal(result.removedConceptSourceLinkIds.includes("old"), false);

	const secondStorage = new Storage();
	secondStorage.data.conceptSourceLinks = { old: link("old", "orphan-id"), new: link("new", "new-id") };
	const secondVault = new Vault();
	let hasScanned = false;
	let hasRepaired = false;
	const secondReconciler = new VaultStateReconciler({
		vault: {
			exists: async (path: string) => {
				if (hasScanned && !hasRepaired) {
					hasRepaired = true;
					await new RecoverableConceptIdRepair(secondVault, secondStorage).repair(issue, "new-id");
				}
				return secondVault.files.has(path);
			},
			listMarkdownFiles: () => secondVault.listMarkdownFiles(),
		},
		conceptScanner: { scanConcepts: async () => { hasScanned = true; return []; } },
		conceptSourceLinkStore: new ConceptSourceLinkStore(secondStorage),
		knowledgeProposalStore: new KnowledgeProposalStore(secondStorage),
		sourceAnalysisStore: new SourceAnalysisStore(secondStorage),
	});
	const secondResult = await secondReconciler.reconcile();
	assert.equal(hasScanned, true);
	assert.equal(hasRepaired, true);
	assert.equal(secondStorage.data.conceptIdRepairs?.["new-id"]?.status, "completed");
	assert.deepEqual(secondStorage.data.conceptSourceLinks, { old: link("old", "orphan-id"), new: link("new", "new-id") });
	assert.ok(secondResult.deferredConceptSourceLinkIds.includes("old"));
	assert.ok(secondResult.deferredConceptSourceLinkIds.includes("new"));
	assert.deepEqual(secondResult.removedConceptSourceLinkIds, []);
	console.log("Identity repair provenance tests passed.");
}

export const done = run();
