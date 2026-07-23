import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { assessManualConceptDuplicates } from "../src/services/manualConceptDuplicateCheck";
import { ManualConceptDraftStore } from "../src/services/manualConceptDraftStore";
import { createManualConcept } from "../src/services/manualConceptService";
import { ManualConceptProvenanceCommitter } from "../src/services/manualConceptProvenanceService";

class MemoryVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	removeError?: Error;

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error("exists");
		this.files.set(path, content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async remove(path: string): Promise<void> {
		if (this.removeError) throw this.removeError;
		this.files.delete(path);
	}
}

class MemoryPluginStorage {
	data: MnemePluginData = createDefaultPluginData();

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.data = data;
	}
}

async function run(): Promise<void> {
	const vault = new MemoryVault();
	const first = await createManualConcept({
		coreMeaning: "向量空间对向量加法和标量乘法封闭。",
		englishName: "Vector Space",
		importance: "high",
		learningMode: "reviewable",
		tags: ["线性代数", "Linear Algebra"],
		title: "向量空间",
	}, DEFAULT_SETTINGS, vault, () => "concept_manual_one");
	const markdown = vault.files.get(first.path) ?? "";

	assert.equal(first.path, "Mneme/Concepts/向量空间-(Vector-Space).md");
	assert.match(markdown, /mneme_id: concept_manual_one/);
	assert.match(markdown, /mneme_title: "向量空间"/);
	assert.match(markdown, /mneme_english_name: "Vector Space"/);
	assert.match(markdown, /cards: "\[\[Mneme\/Cards\/向量空间-\(Vector-Space\)\/Cards\|向量空间 \(Vector Space\) Cards\]\]"/);
	assert.match(markdown, /^# 向量空间 \(Vector Space\)$/m);
	assert.match(markdown, /tags: \[线性代数, linear-algebra\]/);
	assert.equal(markdown.includes("Source Notes"), false);
	assert.equal(markdown.includes("Add views here"), false);

	const second = await createManualConcept({
		coreMeaning: "A separate user-authored Concept.",
		englishName: "Vector Space",
		title: "向量空间",
	}, DEFAULT_SETTINGS, vault);
	const secondMarkdown = vault.files.get(second.path) ?? "";
	assert.equal(second.path, "Mneme/Concepts/向量空间-(Vector-Space)-2.md");
	assert.equal(second.conceptId, "concept-vector-space-2");
	assert.match(secondMarkdown, /mneme_title: "向量空间 - 2"/);
	assert.match(secondMarkdown, /^# 向量空间 - 2 \(Vector Space\)$/m);

	const legacyCombined = await createManualConcept({
		coreMeaning: "间隔效应把学习分散到多个时间点。",
		title: "间隔效应 (Spacing Effect)",
	}, DEFAULT_SETTINGS, vault);
	const legacyCombinedMarkdown = vault.files.get(legacyCombined.path) ?? "";
	assert.equal(legacyCombined.conceptId, "concept-spacing-effect");
	assert.match(legacyCombinedMarkdown, /mneme_title: "间隔效应"/);
	assert.match(legacyCombinedMarkdown, /mneme_english_name: "Spacing Effect"/);
	assert.match(legacyCombinedMarkdown, /^# 间隔效应 \(Spacing Effect\)$/m);

	await assert.rejects(
		createManualConcept({
			coreMeaning: "无效英文名。",
			englishName: "间隔效应",
			title: "间隔效应",
		}, DEFAULT_SETTINGS, vault),
		/canonical English term/,
	);

	const storage = new MemoryPluginStorage();
	storage.data.sourceAnalysisRecords["Notes/Information Theory.md"] = {
		contentHash: "source-hash",
		lastAiCaptureFingerprint: "existing-capture-fingerprint",
		lastAnalyzedAt: "2026-07-13T12:00:00.000Z",
		linkedConceptIds: ["concept-existing"],
		mtime: 90,
		pendingProposalIds: [],
		size: 180,
		sourcePath: "Notes/Information Theory.md",
		status: "clean",
	};
	const sourced = await createManualConcept({
		coreMeaning: "Entropy measures uncertainty in a probability distribution.",
		sourcePath: "Notes/Information Theory.md",
		title: "Entropy",
	}, DEFAULT_SETTINGS, vault, () => "concept_manual_entropy", new ManualConceptProvenanceCommitter(
		storage,
		{
			contentHash: "source-hash",
			mtime: 100,
			path: "Notes/Information Theory.md",
			size: 200,
		},
		() => "2026-07-14T12:00:00.000Z",
	));
	const sourcedMarkdown = vault.files.get(sourced.path) ?? "";
	assert.match(sourcedMarkdown, /## Source Notes/);
	assert.match(sourcedMarkdown, /> - \[\[Notes\/Information Theory\]\]/);
	const sourceLinks = Object.values(storage.data.conceptSourceLinks);
	assert.equal(sourceLinks.length, 1);
	assert.equal(sourceLinks[0]?.conceptId, sourced.conceptId);
	assert.equal(sourceLinks[0]?.relationType, "origin");
	assert.deepEqual(storage.data.sourceAnalysisRecords["Notes/Information Theory.md"]?.linkedConceptIds, [
		"concept-existing",
		sourced.conceptId,
	]);
	assert.equal(
		storage.data.sourceAnalysisRecords["Notes/Information Theory.md"]?.lastAiCaptureFingerprint,
		"existing-capture-fingerprint",
	);
	assert.deepEqual(storage.data.knowledgeProposals, {});

	await assert.rejects(
		createManualConcept({
			coreMeaning: "Rollback test.",
			title: "Rollback",
		}, DEFAULT_SETTINGS, vault, () => "concept_manual_rollback", {
			commit: async () => {
				throw new Error("State write failed.");
			},
		}),
		/State write failed/,
	);
	assert.equal(vault.files.has("Mneme/Concepts/Rollback.md"), false);

	vault.removeError = new Error("Vault rollback failed.");
	await assert.rejects(
		createManualConcept({
			coreMeaning: "Rollback reporting test.",
			title: "Rollback Reporting",
		}, DEFAULT_SETTINGS, vault, () => "concept_manual_rollback_reporting", {
			commit: async () => {
				throw new Error("State write failed again.");
			},
		}),
		/State write failed again\. Rollback also failed: Vault rollback failed/,
	);
	assert.equal(vault.files.has("Mneme/Concepts/Rollback-Reporting.md"), true);
	vault.removeError = undefined;

	await assert.rejects(
		createManualConcept({ coreMeaning: "", title: "Empty" }, DEFAULT_SETTINGS, vault),
		/Core Meaning is required/,
	);

	const duplicateConcepts: ConceptSummary[] = [{
		conceptId: "concept-information-gain",
		coreMeaning: "Information gain measures the reduction in entropy after a split.",
		path: "Mneme/Concepts/Information-Gain.md",
		title: "Information Gain",
	}];
	const exact = assessManualConceptDuplicates("information-gain", "Different wording.", duplicateConcepts);
	assert.equal(exact.exact?.conceptId, "concept-information-gain");
	const possible = assessManualConceptDuplicates(
		"Entropy Reduction",
		"Information gain measures the reduction in entropy after a split.",
		duplicateConcepts,
	);
	assert.equal(possible.possible[0]?.concept.conceptId, "concept-information-gain");

	const draftStore = new ManualConceptDraftStore(storage);
	await draftStore.saveDraft({
		coreMeaning: "Draft meaning",
		englishName: "Draft",
		importance: "high",
		learningMode: "reviewable",
		sourcePath: "Notes/Draft.md",
		tags: ["draft"],
		title: "Draft",
		updatedAt: "2026-07-14T12:30:00.000Z",
		whyItMatters: "Draft value",
	});
	const loadedDraft = await draftStore.getDraft();
	assert.equal(loadedDraft?.sourcePath, "Notes/Draft.md");
	assert.deepEqual(loadedDraft?.tags, ["draft"]);
	await draftStore.clearDraft();
	assert.equal(await draftStore.getDraft(), undefined);
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
