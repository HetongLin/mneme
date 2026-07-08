import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	ConceptMergeService,
	type ConceptMergeStorage,
	type ConceptMergeVaultAdapter,
} from "../src/services/conceptMergeService";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

const survivor = createConcept("concept-a", "Alpha", "Mneme/Concepts/Alpha/Concept.md", "Mneme/Cards/Alpha/Card.md");
const merged = createConcept("concept-b", "Beta", "Mneme/Concepts/Beta/Concept.md", "Mneme/Cards/Beta/Card.md");

async function runAsyncTests(): Promise<void> {
	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage, () => "2026-07-09T10:00:00.000Z");
		const filesBeforePreview = { ...vault.files };
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "ready");
		assert.deepEqual(vault.files, filesBeforePreview);
		assert.equal(storage.saveCount, 0);
		if (prepared.status !== "ready") {
			throw new Error(prepared.message);
		}
		const { plan } = prepared;
		assert.equal(plan.cardsMoved, 1);
		assert.equal(plan.pauseMigrated, true);
		assert.equal(plan.duplicateDismissalsMigrated, 1);
		assert.equal(plan.sourceLinksMigrated, 1);
		assert.deepEqual(plan.sourceLinkChanges, [{
			relationType: "origin",
			sourcePath: "Notes/Shared.md",
			status: "approved",
		}]);
		assert.equal(plan.writes.length, 4);
		const targetCards = plan.writes.find((write) => write.path === survivor.cardsPath)?.after ?? "";
		assert.deepEqual(parseMnemeCards(targetCards).map((card) => card.explicitCardId), ["card-a", "card-b"]);
		const oldCards = plan.writes.find((write) => write.path === merged.cardsPath)?.after ?? "";
		assert.deepEqual(parseMnemeCards(oldCards), []);
		assert.match(oldCards, /redirect_cards_to:/);
		const finalConcept = plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		assert.match(finalConcept, /### Merged from Beta \(concept-b\)/);
		assert.match(finalConcept, /#### Source Notes/);
		assert.match(finalConcept, /\[\[Notes\/Shared\]\]/);
		assert.match(plan.writes.find((write) => write.path === merged.path)?.after ?? "", /mneme_type: concept_redirect/);
		assert.equal(plan.nextData.pausedConcepts["concept-a"]?.conceptId, "concept-a");
		assert.equal(plan.nextData.pausedConcepts["concept-b"], undefined);
		assert.deepEqual(plan.nextData.sourceAnalysisRecords["Notes/Shared.md"]?.linkedConceptIds, ["concept-a"]);
		assert.equal(plan.nextData.conceptMergeRecords["concept-b"]?.survivorConceptId, "concept-a");
		const sharedLink = Object.values(plan.nextData.conceptSourceLinks)
			.find((link) => link.sourcePath === "Notes/Shared.md");
		assert.equal(sharedLink?.evidence.length, 2);
		assert.equal(plan.nextData.conceptSourceLinks.unrelatedOne?.conceptId, "concept-z");
		assert.equal(plan.nextData.conceptSourceLinks.unrelatedTwo?.conceptId, "concept-z");
		assert.doesNotMatch(finalConcept, /Notes\/Unrelated/);
		assert.equal(Object.values(plan.nextData.conceptDuplicateDismissals)[0]?.conceptIds.includes("concept-a"), true);
		assert.equal(plan.nextData.conceptMergeRecords["concept-old"]?.survivorConceptId, "concept-a");

		const result = await service.execute(plan, finalConcept);
		assert.deepEqual(result, { status: "merged" });
		assert.match(vault.files[merged.path] ?? "", /concept_redirect/);
		assert.equal(storage.data.conceptMergeRecords["concept-b"]?.survivorPath, survivor.path);
		assert.equal(storage.data.reviewStates["card-b"]?.reviewCount, 2);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") {
			return;
		}
		vault.files[survivor.path] += "\nConcurrent edit\n";
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "conflict");
		assert.equal(storage.saveCount, 0);
		assert.match(vault.files[survivor.path] ?? "", /Concurrent edit/);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			storage.data = {
				...storage.data,
				settings: { ...storage.data.settings, dailyCardLimit: storage.data.settings.dailyCardLimit + 1 },
			};
			const before = { ...vault.files };
			const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			const result = await service.execute(prepared.plan, finalConcept);

			assert.equal(result.status, "conflict");
			assert.deepEqual(vault.files, before);
			assert.equal(storage.saveCount, 0);
		}
	}

	{
		const data = createData();
		data.knowledgeProposals.blocking = {
			conceptId: "concept-b",
			createdAt: "2026-07-09T09:00:00.000Z",
			id: "blocking",
			kind: "update_concept",
			status: "suggested",
			updatedAt: "2026-07-09T09:00:00.000Z",
		};
		const service = new ConceptMergeService(new MemoryMergeVault(createFiles()), new MemoryMergeStorage(data));
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "blocked");
		if (prepared.status === "blocked") {
			assert.match(prepared.message, /Resolve Inbox proposal/);
		}
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") {
			return;
		}
		storage.partialFailOnce = true;
		const before = { ...vault.files };
		const dataBefore = JSON.stringify(storage.data);
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "failed");
		assert.deepEqual(vault.files, before);
		assert.equal(JSON.stringify(storage.data), dataBefore);
	}

	{
		const files = createFiles();
		files[merged.cardsPath as string] = files[merged.cardsPath as string]?.replace('id="card-b"', "") ?? "";
		const service = new ConceptMergeService(new MemoryMergeVault(files), new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "blocked");
		if (prepared.status === "blocked") {
			assert.match(prepared.message, /Repair every Card ID/);
		}
	}

	{
		const survivorWithoutCards: ConceptSummary = { ...survivor, cardsPath: undefined };
		const files = createFiles();
		delete files[survivor.cardsPath as string];
		files[survivor.path] = conceptMarkdown(survivorWithoutCards, "Alpha without cards.");
		const vault = new MemoryMergeVault(files);
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({
			merged,
			preserveMergedAsView: false,
			survivor: survivorWithoutCards,
		});

		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			assert.equal(prepared.plan.cardsMoved, 1);
			assert.equal(prepared.plan.targetCardsPath, merged.cardsPath);
			assert.equal(prepared.plan.writes.length, 3);
			const adoptedCards = prepared.plan.writes.find((write) => write.path === merged.cardsPath)?.after ?? "";
			assert.match(adoptedCards, /mneme_concept_id: concept-a/);
			assert.match(prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "", /cards: "\[\[Mneme\/Cards\/Beta\/Card\|Alpha Cards\]\]"/);
		}
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			const validFinalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			const finalConcept = validFinalConcept
				.replace("mneme_id: concept-a", "mneme_id: changed");
			const result = await service.execute(prepared.plan, finalConcept);
			assert.equal(result.status, "invalid");
			const wrongCardsResult = await service.execute(
				prepared.plan,
				validFinalConcept.replace("Mneme/Cards/Alpha/Card", "Mneme/Cards/Other/Card"),
			);
			assert.equal(wrongCardsResult.status, "invalid");
			assert.equal(storage.saveCount, 0);
		}
	}
}

class MemoryMergeVault implements ConceptMergeVaultAdapter {
	constructor(public files: Record<string, string>) {
	}

	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) {
			throw new Error(`Missing file: ${path}`);
		}
		return content;
	}

	async modify(path: string, content: string): Promise<void> {
		if (this.files[path] === undefined) {
			throw new Error(`Missing file: ${path}`);
		}
		this.files[path] = content;
	}
}

class MemoryMergeStorage implements ConceptMergeStorage {
	data: MnemePluginData;
	partialFailOnce = false;
	saveCount = 0;

	constructor(data: MnemePluginData) {
		this.data = data;
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		if (this.partialFailOnce) {
			this.data = data;
			this.partialFailOnce = false;
			throw new Error("Partial persist failed");
		}
		this.data = data;
		this.saveCount += 1;
	}
}

function createConcept(conceptId: string, title: string, path: string, cardsPath?: string): ConceptSummary {
	return { cardsPath, conceptId, coreMeaning: `${title} core`, path, title };
}

function createFiles(): Record<string, string> {
	return {
		[survivor.path]: conceptMarkdown(survivor, "Alpha explains the surviving idea."),
		[merged.path]: conceptMarkdown(merged, "Beta explains another perspective."),
		[survivor.cardsPath as string]: cardMarkdown(survivor, "card-a", "Alpha question", "Alpha answer"),
		[merged.cardsPath as string]: cardMarkdown(merged, "card-b", "Beta question", "Beta answer"),
	};
}

function conceptMarkdown(concept: ConceptSummary, core: string): string {
	const lines = [
		"---",
		"mneme_type: concept",
		`mneme_id: ${concept.conceptId}`,
	];
	if (concept.cardsPath) {
		lines.push(`cards: "[[${concept.cardsPath}|${concept.title} Cards]]"`);
	}
	lines.push(
		"---",
		`# ${concept.title}`,
		"",
		"## Core Meaning",
		"",
		core,
		"",
		"## Source Notes",
		"",
		"> [!info]- Source Notes",
		"> Add source notes here.",
		"",
	);
	return lines.join("\n");
}

function cardMarkdown(concept: ConceptSummary, cardId: string, front: string, back: string): string {
	return [
		"---",
		"mneme_type: card_group",
		`mneme_concept_id: ${concept.conceptId}`,
		`concept: "[[${concept.path}|${concept.title}]]"`,
		"---",
		`# ${concept.title} Cards`,
		"",
		`<!-- MNEME:CARD:start id="${cardId}" -->`,
		"<!-- MNEME:FRONT:start -->",
		front,
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		back,
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
		"",
	].join("\n");
}

function createData(): MnemePluginData {
	const data = createDefaultPluginData();
	data.settings = DEFAULT_SETTINGS;
	data.pausedConcepts["concept-b"] = { conceptId: "concept-b", pausedAt: "2026-07-08T10:00:00.000Z" };
	data.reviewStates["card-b"] = {
		cardId: "card-b",
		createdAt: "2026-07-08T10:00:00.000Z",
		lapseCount: 0,
		reviewCount: 2,
		updatedAt: "2026-07-08T10:00:00.000Z",
	};
	data.sourceAnalysisRecords["Notes/Shared.md"] = {
		contentHash: "hash",
		lastAnalyzedAt: "2026-07-08T10:00:00.000Z",
		linkedConceptIds: ["concept-a", "concept-b"],
		mtime: 1,
		pendingProposalIds: [],
		size: 1,
		sourcePath: "Notes/Shared.md",
		status: "clean",
	};
	data.conceptSourceLinks.a = {
		addedAt: "2026-07-07T10:00:00.000Z",
		conceptId: "concept-a",
		evidence: [{ excerpt: "Alpha evidence" }],
		id: "a",
		lastSeenAt: "2026-07-08T10:00:00.000Z",
		relationType: "origin",
		sourceHash: "hash-a",
		sourcePath: "Notes/Shared.md",
		status: "approved",
	};
	data.conceptSourceLinks.b = {
		addedAt: "2026-07-08T10:00:00.000Z",
		conceptId: "concept-b",
		evidence: [{ excerpt: "Beta evidence" }],
		id: "b",
		lastSeenAt: "2026-07-09T10:00:00.000Z",
		relationType: "origin",
		sourceHash: "hash-b",
		sourcePath: "Notes/Shared.md",
		status: "approved",
	};
	for (const id of ["unrelatedOne", "unrelatedTwo"]) {
		data.conceptSourceLinks[id] = {
			addedAt: "2026-07-08T10:00:00.000Z",
			conceptId: "concept-z",
			evidence: [{ excerpt: id }],
			id,
			lastSeenAt: "2026-07-09T10:00:00.000Z",
			relationType: "supporting",
			sourceHash: "unrelated",
			sourcePath: "Notes/Unrelated.md",
			status: "approved",
		};
	}
	data.conceptMergeRecords["concept-old"] = {
		mergedAt: "2026-07-01T10:00:00.000Z",
		mergedConceptId: "concept-old",
		mergedPath: "Mneme/Concepts/Old/Concept.md",
		survivorConceptId: "concept-b",
		survivorPath: merged.path,
	};
	data.conceptDuplicateDismissals['["concept-b","concept-c"]'] = {
		conceptIds: ["concept-b", "concept-c"],
		dismissedAt: "2026-07-08T10:00:00.000Z",
		pairKey: '["concept-b","concept-c"]',
	};
	return data;
}

export const done = runAsyncTests();
