import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "../src/services/aiProvider";
import { AiConceptCaptureService } from "../src/services/aiConceptCaptureService";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { SourceAnalysisService } from "../src/services/sourceAnalysisService";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";

const source = {
	content: "Encapsulation hides representation behind a public interface.",
	mtime: 100,
	path: "Notes/OOP.md",
	size: 60,
};

async function run(): Promise<void> {
	{
		const fixture = createFixture({ aiCaptureEnabled: false });
		const result = await fixture.service.analyze(source);

		assert.equal(result.status, "indexed_ai_disabled");
		assert.equal(fixture.provider.callCount, 0);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
		assert.equal((await fixture.sourceStore.getRecord(source.path))?.contentHash.length, 64);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const result = await fixture.service.analyze(source);
		const proposals = await fixture.proposalStore.listActive();
		const record = await fixture.sourceStore.getRecord(source.path);

		assert.equal(result.status, "captured");
		assert.equal(result.proposalCount, 1);
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(proposals.length, 1);
		assert.equal(proposals[0]?.kind, "new_concept");
		assert.equal(proposals[0]?.status, "suggested");
		assert.equal(record?.lastAiCaptureHash, record?.contentHash);
		assert.deepEqual(record?.pendingProposalIds, [proposals[0]?.id]);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.analyze(source);
		const second = await fixture.service.analyze(source);

		assert.equal(second.status, "skipped_ai_already_captured");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: false, aiProvider: "mock" });
		await fixture.service.analyze(source);
		fixture.settings.aiCaptureEnabled = true;
		const second = await fixture.service.analyze(source);

		assert.equal(second.status, "captured");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({
			aiCaptureEnabled: true,
			aiProvider: "openai",
			openaiApiKey: "",
		});
		const result = await fixture.service.analyze(source);

		assert.equal(result.status, "invalid_config");
		assert.equal(result.message.includes("OpenAI API key is required"), true);
		assert.equal(fixture.provider.callCount, 0);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.response = {
			mode: "concept_capture",
			proposals: [],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: "wrong-hash", path: source.path },
			warnings: [],
		};
		const result = await fixture.service.analyze(source);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI response source does not match the analyzed note.");
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.response = {
			mode: "concept_capture",
			proposals: [{
				confidence: 0.8,
				evidence: [],
				kind: "new_card",
				payload: {},
				rationale: "Invalid during capture.",
				title: "A card",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: "hash", path: source.path },
			warnings: [],
		};
		const result = await fixture.service.analyze(source);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Concept capture must not return new_card proposals.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.analyze(source);

		assert.deepEqual(fixture.provider.lastRequest?.existingConcepts, [{
			conceptId: "concept-abstraction",
			coreMeaning: "Hides unnecessary detail.",
			title: "Abstraction",
		}]);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.responseFactory = (input) => createConceptCaptureResponse(
			input,
			"Encapsulation   hides representation behind a public interface.",
		);
		const result = await fixture.service.analyze(source);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "captured");
		assert.equal(proposals[0]?.evidence?.[0]?.excerpt, source.content);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.responseFactory = (input) => createConceptCaptureResponse(
			input,
			"This sentence does not exist in the Source Note.",
		);
		const result = await fixture.service.analyze(source);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Every Concept proposal must quote grounding from the current Source Note.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}
}

function createFixture(settingsOverrides: Partial<typeof DEFAULT_SETTINGS>) {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
	const storage = new MemoryPluginStorage();
	const sourceStore = new SourceAnalysisStore(storage);
	const proposalStore = new KnowledgeProposalStore(storage);
	const provider = new CountingProvider(new MockAiProvider(settings));
	const readContent = async () => source.content;
	const service = new AiConceptCaptureService({
		conceptScanner: {
			scanConcepts: async () => [{
				conceptId: "concept-abstraction",
				coreMeaning: "Hides unnecessary detail.",
				path: "Mneme/Concepts/Abstraction/Concept.md",
				title: "Abstraction",
			}],
		},
		createProvider: () => provider,
		proposalStore,
		readSourceContent: readContent,
		settingsProvider: () => settings,
		sourceAnalysisService: new SourceAnalysisService(sourceStore, readContent, () => "2026-01-02T12:00:00.000Z"),
		sourceAnalysisStore: sourceStore,
		timestampProvider: () => "2026-01-02T12:00:00.000Z",
	});

	return { proposalStore, provider, service, settings, sourceStore };
}

class CountingProvider implements AiProvider {
	callCount = 0;
	lastRequest?: AiProposalRequest;
	response?: unknown;
	responseFactory?: (input: AiProposalRequest) => unknown;

	constructor(private readonly delegate: AiProvider) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		this.callCount += 1;
		this.lastRequest = input;
		const response = this.responseFactory?.(input) ?? this.response;

		if (response) {
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
				structuredResponse: response,
			};
		}

		return this.delegate.generateKnowledgeProposals(input);
	}
}

function createConceptCaptureResponse(input: AiProposalRequest, quote: string): unknown {
	return {
		mode: "concept_capture",
		proposals: [{
			confidence: 0.9,
			evidence: [{
				explanation: "The Source Note states the Concept directly.",
				quote,
				sourcePath: input.sourcePath,
			}],
			kind: "new_concept",
			payload: {
				conceptTitle: "Encapsulation",
				coreMeaning: "Encapsulation hides representation behind a public interface.",
				learningMode: "reviewable",
				relatedConceptHints: [],
				suggestedImportance: "normal",
				tags: ["oop"],
				views: [],
				whyItMatters: "It protects callers from implementation changes.",
			},
			rationale: "The note defines a durable Concept.",
			title: "Encapsulation",
		}],
		schemaVersion: "mneme.ai.proposals.v1",
		source: { hash: input.sourceHash, path: input.sourcePath },
		warnings: [],
	};
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
