import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "../src/services/aiProvider";
import { AiCardGenerationService } from "../src/services/aiCardGenerationService";
import { extractConceptLearningContent } from "../src/services/conceptLearningContent";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { computeContentHash } from "../src/utils/sourceHash";

const concept = {
	conceptId: "concept-encapsulation",
	conceptPath: "Mneme/Concepts/Encapsulation/Concept.md",
	conceptTitle: "Encapsulation",
	markdown: "# Encapsulation\n\n## Core Meaning\n\nEncapsulation protects representation behind a stable interface.",
};

async function run(): Promise<void> {
	{
		const fixture = createFixture({ aiCaptureEnabled: false });
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "ai_disabled");
		assert.equal(fixture.provider.callCount, 0);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const result = await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "generated");
		assert.equal(result.proposalCount, 1);
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(proposals.length, 1);
		assert.equal(proposals[0]?.kind, "new_card");
		assert.equal(proposals[0]?.conceptId, concept.conceptId);
		assert.equal(proposals[0]?.sourcePath, concept.conceptPath);
		assert.equal(proposals[0]?.status, "suggested");
		assert.equal(
			(await fixture.sourceAnalysisStore.getRecord(concept.conceptPath))?.lastCardGenerationFingerprint,
			await conceptFingerprint(),
		);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "skipped_active_proposals");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};

		const first = await fixture.service.generate(concept);
		const second = await fixture.service.generate(concept);
		const record = await fixture.sourceAnalysisStore.getRecord(concept.conceptPath);

		assert.equal(first.status, "coverage_complete");
		assert.equal(first.proposalCount, 0);
		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(record?.lastCardGenerationOutcome, "coverage_complete");
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();
		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "rejected" as const }]),
		));

		const retry = await fixture.service.generate(concept);

		assert.equal(retry.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const updatedConcept = {
			...concept,
			markdown: `${concept.markdown}\n\n## Why It Matters\n\nUpdated Concept content.`,
		};
		const second = await fixture.service.generate(updatedConcept);

		assert.equal(second.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();
		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const metadataOnlyChange = {
			...concept,
			markdown: `---\nmneme_type: concept\ntags: [changed]\n---\n\n${concept.markdown}\n\n## Source Notes\n\n[[Notes/Changed]]`,
		};
		const second = await fixture.service.generate(metadataOnlyChange);

		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "",
		});
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_config");
		assert.equal(result.message.includes("DeepSeek API key is required"), true);
		assert.equal(fixture.provider.callCount, 0);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [{
				confidence: 0.9,
				evidence: [{
					explanation: "The target test still uses valid Concept grounding.",
					quote: "Encapsulation protects representation behind a stable interface.",
					sourcePath: concept.conceptPath,
				}],
				kind: "new_concept",
				payload: {},
				rationale: "Invalid in card generation.",
				title: "Invalid Concept",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: "wrong", path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Card generation must not return new_concept proposals.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [{
				confidence: 0.9,
				evidence: [{
					explanation: "The target test still uses valid Concept grounding.",
					quote: "Encapsulation protects representation behind a stable interface.",
					sourcePath: concept.conceptPath,
				}],
				kind: "new_card",
				payload: {
					back: "Wrong target.",
					cardType: "definition",
					conceptId: "concept-other",
					conceptTitle: "Other",
					front: "What is this?",
					rubric: "Names the other concept.",
				},
				rationale: "Incorrect target association.",
				title: "Wrong target Card",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI Card proposals do not match the current Concept.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: Array.from({ length: 6 }, (_, index) => createCardProposal(index)),
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Card generation must return at most 5 proposals.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence[0]!.quote = "This quote is not in the approved Concept.";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Every Card proposal must quote grounding from the current approved Concept.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence = [];
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "proposals.0.evidence must identify approved Concept grounding.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence[0]!.sourcePath = "Mneme/Concepts/Other/Concept.md";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Every Card proposal must quote grounding from the current approved Concept.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}
}

function createCardProposal(index: number) {
	return {
		confidence: 0.9,
		evidence: [{
			explanation: "Grounded in the approved Core Meaning.",
			quote: "Encapsulation protects representation behind a stable interface.",
			sourcePath: concept.conceptPath,
		}],
		kind: "new_card" as const,
		payload: {
			back: "It protects representation behind a stable interface.",
			cardType: "definition" as const,
			conceptId: concept.conceptId,
			conceptTitle: concept.conceptTitle,
			front: `What is encapsulation? (${index + 1})`,
			rubric: "Mentions protected representation and a stable interface.",
		},
		rationale: "Tests the approved Core Meaning.",
		title: `Encapsulation Card ${index + 1}`,
	};
}

async function conceptFingerprint(): Promise<string> {
	return computeContentHash(extractConceptLearningContent(concept.markdown, concept.conceptPath));
}

function createFixture(settingsOverrides: Partial<typeof DEFAULT_SETTINGS>) {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
	const storage = new MemoryPluginStorage();
	const proposalStore = new KnowledgeProposalStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const provider = new CountingProvider(new MockAiProvider(settings));
	const service = new AiCardGenerationService({
		createProvider: () => provider,
		proposalStore,
		settingsProvider: () => settings,
		sourceAnalysisStore,
		timestampProvider: () => "2026-01-02T12:00:00.000Z",
	});

	return { proposalStore, provider, service, sourceAnalysisStore };
}

class CountingProvider implements AiProvider {
	callCount = 0;
	lastRequest?: AiProposalRequest;
	response?: unknown;

	constructor(private readonly delegate: AiProvider) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		this.callCount += 1;
		this.lastRequest = input;

		if (this.response) {
			return {
				diagnostics: {
					inputChars: input.sourceContent.length,
					logSafeConfig: {
						aiCaptureEnabled: true,
						aiMaxInputChars: 20000,
						aiProvider: "mock",
						aiRequestTimeoutMs: 30000,
						deepseekApiKeyConfigured: false,
						deepseekBaseUrl: "",
						deepseekModel: "",
						openaiApiKeyConfigured: false,
						openaiBaseUrl: "",
						openaiModel: "",
					},
					warnings: [],
				},
				provider: { provider: "mock", structuredOutput: "mock" },
				structuredResponse: this.response,
			};
		}

		return this.delegate.generateKnowledgeProposals(input);
	}
}

class MemoryPluginStorage {
	private data: MnemePluginData = {
		conceptSourceLinks: {},
		knowledgeProposals: {},
		reviewStates: {},
		schemaVersion: 1,
		settings: DEFAULT_SETTINGS,
		sourceAnalysisRecords: {},
	};

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.data = data;
	}
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
