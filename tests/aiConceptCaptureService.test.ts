import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "../src/services/aiProvider";
import { createAiConceptCaptureFingerprint } from "../src/services/aiCaptureFingerprint";
import { AiConceptCaptureService } from "../src/services/aiConceptCaptureService";
import { AiGenerationLock } from "../src/services/aiGenerationLock";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { SourceAnalysisService } from "../src/services/sourceAnalysisService";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { splitSourceForAiCapture } from "../src/services/sourceCaptureChunker";

const source = {
	content: "Encapsulation hides representation behind a public interface.",
	mtime: 100,
	path: "Notes/OOP.md",
	size: 60,
};

async function run(): Promise<void> {
	{
		const content = "# First\n\nFirst paragraph.\n\n## Second\n\nSecond paragraph with more text.\n";
		const chunks = splitSourceForAiCapture(content, 38);

		assert.equal(chunks.length > 1, true);
		assert.equal(chunks.every((chunk) => chunk.content.length <= 38), true);
		assert.equal(chunks.map((chunk) => chunk.content).join(""), content);
		assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_chunk, index) => index + 1));
		assert.equal(chunks.every((chunk) => chunk.total === chunks.length), true);
	}

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
		assert.equal(typeof record?.lastAiCaptureFingerprint, "string");
		assert.equal(record?.lastAiCaptureAnalyzedChars, source.content.length);
		assert.equal(record?.lastAiCaptureTotalChars, source.content.length);
		assert.equal(record?.lastAiCaptureChunkCount, 1);
		assert.equal(result.message.includes(`Analyzed ${source.content.length}/${source.content.length} characters across 1 chunk.`), true);
		assert.deepEqual(record?.pendingProposalIds, [proposals[0]?.id]);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.analyze(source);
		const second = await fixture.service.analyze(source);

		assert.equal(second.status, "skipped_ai_already_captured");
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(second.message.includes(`Last capture analyzed ${source.content.length}/${source.content.length} characters`), true);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.analyze(source);
		fixture.settings.aiConceptStyleGuidance = "Prefer fewer, exam-focused Concepts.";
		const second = await fixture.service.analyze(source);

		assert.equal(second.status, "captured");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const requestStarted = createDeferred();
		const releaseRequest = createDeferred();
		fixture.provider.onCall = () => requestStarted.resolve();
		fixture.provider.blocker = releaseRequest.promise;

		const firstPromise = fixture.service.analyze(source);
		await requestStarted.promise;
		const second = await fixture.service.analyze(source);

		assert.equal(second.status, "generation_in_progress");
		assert.equal(second.proposalCount, 0);
		assert.equal(second.message.includes("already in progress for this Source Note"), true);
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(fixture.generationLock.isActive("concept_capture", source.path), true);

		releaseRequest.resolve();
		const first = await firstPromise;

		assert.equal(first.status, "captured");
		assert.equal(fixture.generationLock.isActive("concept_capture", source.path), false);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.error = new Error("Temporary provider failure.");

		const failed = await fixture.service.analyze(source);
		fixture.provider.error = undefined;
		const retry = await fixture.service.analyze(source);

		assert.equal(failed.status, "failed");
		assert.equal(retry.status, "captured");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiMaxInputChars: 30, aiProvider: "mock" });
		const firstFingerprint = await createAiConceptCaptureFingerprint(
			"content-hash",
			source.path,
			fixture.settings,
		);
		await fixture.service.analyze(source);
		const firstCallCount = fixture.provider.callCount;
		fixture.settings.aiMaxInputChars = 20;
		const secondFingerprint = await createAiConceptCaptureFingerprint(
			"content-hash",
			source.path,
			fixture.settings,
		);
		const second = await fixture.service.analyze(source);

		assert.notEqual(firstFingerprint, secondFingerprint);
		assert.equal(second.status, "captured");
		assert.equal(fixture.provider.callCount, firstCallCount + (second.chunkCount ?? 0));
		assert.equal((second.chunkCount ?? 0) > 1, true);
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

	{
		const longSource = {
			content: [
				"# Alpha\n\nAlpha is a durable concept supported by this paragraph.\n\n",
				"# Beta\n\nBeta is another durable concept supported by this paragraph.\n\n",
				"# Gamma\n\nGamma is a third durable concept supported by this paragraph.\n",
			].join(""),
			mtime: 200,
			path: "Notes/Long.md",
			size: 210,
		};
		const fixture = createFixture(
			{ aiCaptureEnabled: true, aiMaxInputChars: 80, aiProvider: "mock" },
			longSource,
		);
		const result = await fixture.service.analyze(longSource);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "captured");
		assert.equal(result.chunkCount, fixture.provider.callCount);
		assert.equal((result.chunkCount ?? 0) > 1, true);
		assert.equal(result.analyzedChars, longSource.content.length);
		assert.equal(result.totalChars, longSource.content.length);
		assert.equal(fixture.provider.requests.map((request) => request.sourceContent).join(""), longSource.content);
		assert.equal(fixture.provider.requests.every((request) => request.sourceContent.length <= 80), true);
		assert.equal(fixture.provider.requests.every((request) => (
			request.mode === "concept_capture" && request.languageReferenceContent === longSource.content
		)), true);
		assert.equal(fixture.provider.requests.every((request) => (
			request.mode !== "concept_capture"
			|| !Object.prototype.hasOwnProperty.call(request.sourceChunk, "content")
		)), true);
		assert.equal(proposals.length, 1);
		assert.equal(proposals[0]?.ai?.warnings?.some((warning) => warning.includes("duplicate cross-chunk Concept proposal")), true);
	}

	{
		const longSource = {
			content: "# Alpha\n\nAlpha evidence.\n\n# Beta\n\nBeta evidence.\n",
			mtime: 300,
			path: "Notes/Atomic.md",
			size: 60,
		};
		const fixture = createFixture(
			{ aiCaptureEnabled: true, aiMaxInputChars: 30, aiProvider: "mock" },
			longSource,
		);
		fixture.provider.responseFactory = (input) => createConceptCaptureResponse(
			input,
			input.mode === "concept_capture" && input.sourceChunk?.index === 2
				? "This quote is not in the Source Note."
				: input.sourceContent.trim(),
			`Chunk ${input.mode === "concept_capture" ? input.sourceChunk?.index : 0}`,
		);
		const result = await fixture.service.analyze(longSource);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message.startsWith("Chunk 2/"), true);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
		assert.equal((await fixture.sourceStore.getRecord(longSource.path))?.lastAiCaptureFingerprint, undefined);
	}
}

function createFixture(settingsOverrides: Partial<typeof DEFAULT_SETTINGS>, testSource = source) {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
	const storage = new MemoryPluginStorage();
	const sourceStore = new SourceAnalysisStore(storage);
	const proposalStore = new KnowledgeProposalStore(storage);
	const provider = new CountingProvider(new MockAiProvider(settings));
	const generationLock = new AiGenerationLock();
	const readContent = async () => testSource.content;
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
		generationLock,
		proposalStore,
		readSourceContent: readContent,
		settingsProvider: () => settings,
		sourceAnalysisService: new SourceAnalysisService(sourceStore, readContent, () => "2026-01-02T12:00:00.000Z"),
		sourceAnalysisStore: sourceStore,
		timestampProvider: () => "2026-01-02T12:00:00.000Z",
	});

	return { generationLock, proposalStore, provider, service, settings, sourceStore };
}

class CountingProvider implements AiProvider {
	blocker?: Promise<void>;
	callCount = 0;
	error?: Error;
	lastRequest?: AiProposalRequest;
	onCall?: () => void;
	requests: AiProposalRequest[] = [];
	response?: unknown;
	responseFactory?: (input: AiProposalRequest) => unknown;

	constructor(private readonly delegate: AiProvider) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		this.callCount += 1;
		this.lastRequest = input;
		this.requests.push(input);
		this.onCall?.();
		if (this.blocker) await this.blocker;
		if (this.error) throw this.error;
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

function createDeferred(): { promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

function createConceptCaptureResponse(input: AiProposalRequest, quote: string, title = "Encapsulation"): unknown {
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
				conceptTitle: title,
				coreMeaning: "Encapsulation hides representation behind a public interface.",
				learningMode: "reviewable",
				relatedConceptHints: [],
				suggestedImportance: "normal",
				tags: ["oop"],
				views: [],
				whyItMatters: "It protects callers from implementation changes.",
			},
			rationale: "The note defines a durable Concept.",
			title,
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
