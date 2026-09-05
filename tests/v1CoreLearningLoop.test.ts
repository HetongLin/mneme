import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { MnemeVaultAdapter } from "../src/services/approvedProposalWriter";
import { ApprovedProposalWriter } from "../src/services/approvedProposalWriter";
import { AiCardGenerationService } from "../src/services/aiCardGenerationService";
import { AiConceptCaptureService } from "../src/services/aiConceptCaptureService";
import { AiGenerationLock } from "../src/services/aiGenerationLock";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { ConceptSourceLinkStore } from "../src/services/conceptSourceLinkStore";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { InboxAcceptanceWorkflow } from "../src/services/inboxAcceptanceWorkflow";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { ReviewStateStore } from "../src/services/reviewStateStore";
import { SourceAnalysisService } from "../src/services/sourceAnalysisService";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { buildCardGroupPath } from "../src/utils/markdownPath";
import { createPluginData, MemoryKnowledgeProposalStorage } from "./knowledgeProposalTestUtils";

class MemoryVault implements MnemeVaultAdapter {
	readonly files = new Map<string, string>();
	readonly folders = new Set<string>();

	async append(path: string, content: string): Promise<void> {
		this.files.set(path, `${this.files.get(path) ?? ""}${content}`);
	}

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		this.files.set(path, content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async modify(path: string, content: string): Promise<void> {
		if (!this.files.has(path)) throw new Error(`Missing file: ${path}`);
		this.files.set(path, content);
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		this.files.set(path, transform(content));
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}
}

async function run(): Promise<void> {
	const now = "2026-07-16T08:00:00.000Z";
	const sourcePath = "Notes/Learning Loop.md";
	const sourceContent = "Retrieval practice strengthens memory by requiring active recall before feedback.";
	const settings = {
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "mock" as const,
	};
	const storage = new MemoryKnowledgeProposalStorage(createPluginData());
	const vault = new MemoryVault();
	const proposalStore = new KnowledgeProposalStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const generationLock = new AiGenerationLock();
	let approvedConcept: ConceptSummary | undefined;
	const conceptScanner = {
		scanConcepts: async () => approvedConcept ? [approvedConcept] : [],
		};
		const provider = new MockAiProvider(settings);
		const captureService = new AiConceptCaptureService({
			createProvider: () => provider,
			generationLock,
		proposalStore,
		readSourceContent: async (path) => {
			assert.equal(path, sourcePath);
			return sourceContent;
		},
		settingsProvider: () => settings,
		sourceAnalysisService: new SourceAnalysisService(
			sourceAnalysisStore,
			async () => sourceContent,
			() => now,
		),
		sourceAnalysisStore,
		timestampProvider: () => now,
	});
	const writer = new ApprovedProposalWriter({
		conceptScanner,
		conceptSourceLinkStore: new ConceptSourceLinkStore(storage),
		now: () => now,
		proposalStore,
		settingsProvider: () => settings,
		sourceAnalysisStore,
		vaultAdapter: vault,
	});
	const acceptance = new InboxAcceptanceWorkflow({ proposalStore, writer });

	const capture = await captureService.analyze({
		mtime: 1,
		path: sourcePath,
		size: sourceContent.length,
	});
	assert.equal(capture.status, "captured");
	assert.equal(capture.proposalCount, 1);

	const conceptProposals = await proposalStore.listActive();
	const conceptProposal = conceptProposals[0];
	assert.equal(conceptProposals.length, 1);
	assert.equal(conceptProposal?.kind, "new_concept");
	if (!conceptProposal || conceptProposal.kind !== "new_concept" || !conceptProposal.payload) {
		throw new Error("Expected one complete new Concept proposal.");
	}

	const conceptAcceptance = await acceptance.acceptProposal(conceptProposal.id);
	assert.equal(conceptAcceptance.status, "accepted");
	assert.equal((await proposalStore.getProposal(conceptProposal.id))?.status, "written");
	const conceptPath = conceptAcceptance.targetPaths?.[0];
	assert.ok(conceptPath);
	const conceptMarkdown = await vault.read(conceptPath);
	const conceptTitle = conceptProposal.payload.title;
	const conceptId = conceptMarkdown.match(/^mneme_id:\s*(\S+)$/m)?.[1];
	assert.match(conceptId ?? "", /^concept-[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
	if (!conceptId) throw new Error("Written Concept is missing mneme_id.");
	approvedConcept = {
		cardsPath: buildCardGroupPath(settings.cardsFolder, conceptTitle),
		conceptId,
		coreMeaning: conceptProposal.payload.coreMeaning,
		learningMode: "reviewable",
		path: conceptPath,
		title: conceptTitle,
	};
	assert.match(conceptMarkdown, /^---[\s\S]*^mneme_type: concept$/m);
	assert.match(conceptMarkdown, /## Core Meaning/);
	assert.match(conceptMarkdown, /## Why It Matters/);
	assert.match(conceptMarkdown, /## Source Notes/);
	assert.deepEqual((await sourceAnalysisStore.getRecord(sourcePath))?.linkedConceptIds, [conceptId]);

	const cardGeneration = new AiCardGenerationService({
		createProvider: () => provider,
		generationLock,
		proposalStore,
		settingsProvider: () => settings,
		sourceAnalysisStore,
		timestampProvider: () => now,
	});
	const generated = await cardGeneration.generate({
		conceptId,
		conceptPath,
		conceptTitle,
		markdown: conceptMarkdown,
	});
	assert.equal(generated.status, "generated");
	assert.equal(generated.proposalCount, 1);

	const activeAfterCardGeneration = await proposalStore.listActive();
	const cardProposal = activeAfterCardGeneration[0];
	assert.equal(activeAfterCardGeneration.length, 1);
	assert.equal(cardProposal?.kind, "new_card");
	if (!cardProposal || cardProposal.kind !== "new_card") {
		throw new Error("Expected one new Card proposal.");
	}

	const cardAcceptance = await acceptance.acceptProposal(cardProposal.id);
	assert.equal(cardAcceptance.status, "accepted");
	assert.equal((await proposalStore.getProposal(cardProposal.id))?.status, "written");
	assert.deepEqual(await proposalStore.listActive(), []);
	const cardGroupPath = cardAcceptance.targetPaths?.[0];
	assert.equal(cardGroupPath, approvedConcept.cardsPath);
	const cardGroupMarkdown = await vault.read(cardGroupPath as string);
	const cards = parseMnemeCards(cardGroupMarkdown);
	assert.equal(cards.length, 1);
	assert.equal(cards[0]?.isValid, true);
	assert.ok(cards[0]?.explicitCardId);

	const cardId = cards[0]?.explicitCardId as string;
	const reviewStore = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
	await reviewStore.load();
	const reviewed = await reviewStore.recordReview(cardId, "good");
	assert.equal(reviewed.cardId, cardId);
	assert.equal(reviewed.lastRating, "good");
	assert.equal(reviewed.reviewCount, 1);
	assert.equal(reviewed.scheduler, "fsrs");
	assert.equal(reviewStore.getReviewEvents().length, 1);

	const reloadedStore = new ReviewStateStore(storage, new FsrsReviewScheduler({ enableFuzz: false }));
	await reloadedStore.load();
	assert.deepEqual(reloadedStore.getState(cardId), reviewed);
	assert.equal(reloadedStore.getReviewEvents()[0]?.cardId, cardId);
}

void run().then(
	() => console.log("v1 core learning loop integration test passed."),
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
