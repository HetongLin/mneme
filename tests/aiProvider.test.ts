import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	AiJsonHttpClient,
	toLogSafeAiConfig,
	validateAiProviderConfig,
} from "../src/services/aiProvider";
import { createAiProvider } from "../src/services/aiProviderFactory";
import { validateAiStructuredProposalResponse } from "../src/services/aiProposalValidator";
import { buildDeepSeekKnowledgeProposalPayload, DeepSeekProvider } from "../src/services/deepSeekProvider";
import { detectLearningContentLanguage } from "../src/services/learningContentLanguage";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { buildOpenAiKnowledgeProposalPayload, OpenAiProvider } from "../src/services/openAiProvider";

const request = {
	existingConcepts: [{
		conceptId: "concept-encapsulation",
		coreMeaning: "Bundles data with behavior.",
		tags: ["oop", "design"],
		title: "Encapsulation",
	}],
	existingTags: ["design", "machine-learning", "oop"],
	mode: "concept_capture" as const,
	sourceContent: "Encapsulation keeps object internals hidden behind a public interface.",
	sourceHash: "abc123456789",
	sourcePath: "Notes/OOP.md",
};

const cardRequest = {
	conceptId: "concept-encapsulation",
	conceptTitle: "Encapsulation",
	existingCardFronts: ["What is encapsulation?"],
	mode: "card_generation" as const,
	sourceContent: "# Encapsulation\n\n## Core Meaning\n\nEncapsulation protects representation.",
	sourceHash: "concept-hash",
	sourcePath: "Mneme/Concepts/Encapsulation/Concept.md",
};

assert.equal(detectLearningContentLanguage("Bayesian reasoning combines prior beliefs with observed evidence."), "en");
assert.equal(detectLearningContentLanguage("贝叶斯推理将先验知识与观测证据结合起来。Bayes theorem 是核心概念。"), "zh");
assert.equal(detectLearningContentLanguage("---\ntags: [machine-learning]\n---\n贝叶斯推理通过观测证据更新先验信念。"), "zh");
assert.equal(detectLearningContentLanguage("---\ntitle: 贝叶斯定理\n---\nBayesian reasoning updates prior beliefs with observed evidence."), "en");
assert.equal(detectLearningContentLanguage("$P(A \\mid B)$"), "source");

async function run(): Promise<void> {
{
	const provider = new MockAiProvider(DEFAULT_SETTINGS);
	const first = await provider.generateKnowledgeProposals(request);
	const second = await provider.generateKnowledgeProposals(request);

	assert.deepEqual(first.structuredResponse, second.structuredResponse);
	assert.equal(first.structuredResponse.proposals.length, 1);
	assert.equal(first.structuredResponse.proposals[0]?.kind, "new_concept");
	assert.equal(first.provider.provider, "mock");
	assert.equal(validateAiStructuredProposalResponse(first.structuredResponse).valid, true);
}

{
	const provider = new MockAiProvider(DEFAULT_SETTINGS);
	const first = await provider.generateKnowledgeProposals(cardRequest);
	const second = await provider.generateKnowledgeProposals(cardRequest);
	const validated = validateAiStructuredProposalResponse(first.structuredResponse);

	assert.deepEqual(first.structuredResponse, second.structuredResponse);
	assert.equal(validated.valid, true);

	if (validated.valid) {
		assert.equal(validated.data.mode, "card_generation");
		assert.equal(validated.data.proposals.length, 1);
		assert.equal(validated.data.proposals[0]?.kind, "new_card");
	}
}

{
	const provider = new MockAiProvider({
		...DEFAULT_SETTINGS,
		deepseekApiKey: "deepseek-secret-value",
		openaiApiKey: "sk-secret-value",
	});
	const response = await provider.generateKnowledgeProposals(request);
	const kinds = response.structuredResponse.proposals.map((proposal) => proposal.kind);
	const serializedDiagnostics = JSON.stringify(response.diagnostics);

	assert.equal(kinds.some((kind) => kind.includes("card")), false);
	assert.equal(validateAiStructuredProposalResponse(response.structuredResponse).valid, true);
	assert.equal(serializedDiagnostics.includes("sk-secret-value"), false);
	assert.equal(serializedDiagnostics.includes("deepseek-secret-value"), false);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("OpenAI API key is required when AI capture is enabled with the OpenAI provider."), true);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: false,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "deepseek",
		deepseekApiKey: "",
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("DeepSeek API key is required when AI capture is enabled with the DeepSeek provider."), true);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "deepseek",
		deepseekApiKey: "deepseek-test-key",
	});

	assert.equal(result.valid, true);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai" as const,
		deepseekApiKey: "deepseek-secret-value",
		openaiApiKey: "sk-secret-value",
		openaiBaseUrl: "https://api.openai.com/v1",
		openaiModel: "gpt-test",
	};
	const logSafe = toLogSafeAiConfig(settings);
	const serialized = JSON.stringify(logSafe);

	assert.equal(logSafe.openaiApiKeyConfigured, true);
	assert.equal(logSafe.deepseekApiKeyConfigured, true);
	assert.equal(serialized.includes("sk-secret-value"), false);
	assert.equal(serialized.includes("deepseek-secret-value"), false);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		allowedAiCardTypes: ["trap", "application"],
		aiProvider: "openai" as const,
		openaiApiKey: "sk-test-value",
	};
	const payload = buildOpenAiKnowledgeProposalPayload(cardRequest, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);
	const responseSchema = payload.text?.format.schema as any;

	assert.equal(serialized.includes("card_generation"), true);
	assert.equal(serialized.includes("new_card"), true);
	assert.equal(serialized.includes("new_concept"), false);
	assert.equal(serialized.includes("Generate at most five"), false);
	assert.equal(serialized.includes("Copy sourcePath exactly into source.path"), true);
	assert.equal(serialized.includes("Choose cardType by this rubric"), true);
	assert.equal(serialized.includes("Return the exact cardType enum value only"), true);
	assert.equal(serialized.includes("Follow languageContract exactly for generated Card text"), true);
	assert.equal(serialized.includes("Do not rename, remove, replace, or reinterpret required Card fields"), true);
	assert.deepEqual(requestContext.allowedCardTypes, ["trap", "application"]);
	assert.equal(serialized.includes("Enabled cardType values for this request: trap, application"), true);
	assert.equal(serialized.includes("allowed options, not required quotas"), true);
	assert.equal(serialized.includes("do not force a proof Card"), true);
	assert.equal(serialized.includes("User Card style guidance"), false);
	assert.equal(serialized.includes("User style guidance is subordinate"), false);
	assert.deepEqual(responseSchema.properties.proposals.items.properties.payload.properties.cardType.enum, ["trap", "application"]);
	assert.equal(requestContext.languageContract?.outputLanguageCode, "en");
	assert.equal(serialized.includes("Do not translate generated Concept or Card content into Chinese"), true);
	assert.equal(serialized.includes("Use $...$ for short inline math"), true);
	assert.equal(serialized.includes("Use $$...$$ on separate lines"), true);
	assert.equal(serialized.includes("Never emit bare LaTeX"), true);
	assert.equal(serialized.includes("delimiter rules are mandatory"), true);
	assert.equal(serialized.includes("formula-like expression left outside math delimiters"), true);
	assert.equal(serialized.includes("rather than leaving P(h|D)"), true);
	assert.equal(serialized.includes("formattingContract"), true);
	assert.equal(serialized.includes("no spaces immediately inside the delimiters"), true);
	assert.equal(serialized.includes("never return bare formulas in generated payload text"), true);
	assert.equal(serialized.includes("sk-test-value"), false);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		allowedAiCardTypes: ["trap"],
		aiProvider: "deepseek" as const,
		deepseekApiKey: "deepseek-test-value",
	};
	const payload = buildDeepSeekKnowledgeProposalPayload(cardRequest, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);

	assert.equal(serialized.includes("card_generation"), true);
	assert.equal(serialized.includes("new_card"), true);
	assert.equal(serialized.includes("Choose cardType by this rubric"), true);
	assert.equal(serialized.includes("Follow languageContract exactly for generated Card text"), true);
	assert.deepEqual(requestContext.allowedCardTypes, ["trap"]);
	assert.equal(serialized.includes("Enabled cardType values for this request: trap"), true);
	assert.equal(serialized.includes("Do not generate a Card for every enabled type"), true);
	assert.equal(serialized.includes("User Card style guidance"), false);
	assert.equal(requestContext.languageContract?.outputLanguageCode, "en");
	assert.equal(serialized.includes("Use $...$ for short inline math"), true);
	assert.equal(serialized.includes("Use $$...$$ on separate lines"), true);
	assert.equal(serialized.includes("delimiter rules are mandatory"), true);
	assert.equal(serialized.includes("deepseek-test-value"), false);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiMaxInputChars: 12,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
		openaiModel: "gpt-test",
	};
	const payload = buildOpenAiKnowledgeProposalPayload(request, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);

	assert.equal(payload.endpoint, "https://api.openai.com/v1/responses");
	assert.equal(payload.model, "gpt-test");
	assert.equal(payload.text?.format.type, "json_schema");
	assert.equal(serialized.includes("sk-secret-value"), false);
	assert.equal(serialized.includes("Follow languageContract exactly for generated Concept text"), true);
	assert.equal(serialized.includes("Treat it as authoritative"), true);
	assert.equal(requestContext.languageContract?.outputLanguageCode, "en");
	assert.equal(serialized.includes("existingConcepts, existing Concept titles"), true);
	assert.equal(serialized.includes("Do not apply a fixed numerical cap to Concept proposals"), true);
	assert.equal(serialized.includes("exactly one independently explainable, durable knowledge unit"), true);
	assert.equal(serialized.includes("Do not create a Concept from a section heading"), true);
	assert.equal(serialized.includes("shortest unambiguous canonical or established Concept name"), true);
	assert.equal(serialized.includes("Name the knowledge itself, not the Source Note's purpose"), true);
	assert.equal(serialized.includes("Prefer 'Bayes Theorem' over 'Bayes Theorem for Hypothesis Evaluation'"), true);
	assert.equal(serialized.includes("Prefer 'Least Squares as Maximum Likelihood' over 'Maximum Likelihood and Least-Squared Error'"), true);
	assert.equal(serialized.includes("Put an application context in whyItMatters or a View"), true);
	assert.equal(serialized.includes("instead of creating a context-qualified duplicate"), true);
	assert.equal(serialized.includes("Compare each candidate with existingConcepts before creating it"), true);
	assert.equal(serialized.includes("merge_concept"), false);
	assert.equal(serialized.includes("separate reviewed Guided Merge flow"), true);
	assert.equal(serialized.includes("Return an empty proposals array when the Source Note contains no durable knowledge worth creating or linking"), true);
	assert.equal(serialized.includes("at least one evidence entry"), true);
	assert.equal(serialized.includes("Evidence quote must be copied character-for-character from sourceContent"), true);
	assert.equal(serialized.includes("If no exact sourceContent quote supports a proposal, omit that proposal"), true);
	assert.equal(serialized.includes("coreMeaning is the compact primary learning content"), true);
	assert.equal(serialized.includes("whyItMatters states only why it is useful"), true);
	assert.equal(serialized.includes("Do not use whyItMatters to repeat or paraphrase coreMeaning"), true);
	assert.equal(serialized.includes("User Concept style guidance"), false);
	assert.equal(serialized.includes("Do not rename, remove, replace, or reinterpret required Concept fields"), true);
	assert.equal(serialized.includes("Core Meaning and Why It Matters are fixed Mneme product fields"), true);
	assert.equal(serialized.includes("summary"), false);
	assert.equal(serialized.includes("Use existingTags whenever an existing tag reasonably covers the Concept"), true);
	assert.equal(serialized.includes("Tags are for domain, course, or topic-family filtering"), true);
	assert.deepEqual(requestContext.existingTags, ["design", "machine-learning", "oop"]);
	assert.equal(serialized.includes("Use $...$ for short inline math"), true);
	assert.equal(serialized.includes("Use $$...$$ on separate lines"), true);
	assert.equal(serialized.includes("delimiter rules are mandatory"), true);
	assert.equal(serialized.includes("Encapsulation keeps object internals"), false);
	assert.equal(serialized.includes("Encapsulatio"), true);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
	};
	const payload = buildOpenAiKnowledgeProposalPayload({
		...request,
		languageReferenceContent: "这是一篇以中文为主的完整源笔记，当前分块只包含公式。",
		sourceChunk: {
			end: 120,
			index: 2,
			start: 60,
			total: 4,
			totalChars: 240,
		},
		sourceContent: "$P(h \\mid D)$",
	}, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);

	assert.equal(requestContext.languageContract?.outputLanguageCode, "zh");
	assert.equal(serialized.includes("sourceChunk"), true);
	assert.equal(serialized.includes("one exact slice of a longer Source Note"), true);
	assert.equal(serialized.includes("do not defer useful Concepts"), true);
	assert.equal(serialized.includes("这是一篇以中文为主的完整源笔记"), false);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
	};
	const payload = buildOpenAiKnowledgeProposalPayload({
		...request,
		existingConcepts: [{
			conceptId: "concept-bayes-theorem",
			coreMeaning: "贝叶斯定理通过证据更新先验概率。",
			title: "贝叶斯定理 (Bayes Theorem)",
		}],
	}, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);

	assert.equal(requestContext.languageContract?.outputLanguageCode, "en");
	assert.equal(requestContext.languageContract?.outputLanguage, "English");
	assert.equal(serialized.includes("A response that violates languageContract is invalid"), true);
	assert.equal(serialized.includes("Do not translate generated Concept or Card content into Chinese"), true);
	assert.equal(serialized.includes("every AI-authored natural-language field"), true);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
	};
	const payload = buildOpenAiKnowledgeProposalPayload({
		...request,
		existingConcepts: [{
			conceptId: "concept-bayes-theorem",
			coreMeaning: "Bayes theorem updates a prior belief with evidence.",
			title: "Bayes Theorem",
		}],
		sourceContent: "贝叶斯推理将先验知识与观测证据结合起来，并用于更新后验概率。",
	}, settings);
	const serialized = JSON.stringify(payload);
	const requestContext = readRequestContext(payload);

	assert.equal(requestContext.languageContract?.outputLanguageCode, "zh");
	assert.equal(requestContext.languageContract?.outputLanguage, "Chinese");
	assert.equal(serialized.includes("Write generated learning titles and prose primarily in Chinese"), true);
	assert.equal(serialized.includes("append its standard English name in parentheses"), true);
	assert.equal(serialized.includes("中文名称 (English Name)"), true);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiMaxInputChars: 20,
		aiProvider: "deepseek" as const,
		deepseekApiKey: "deepseek-secret-value",
		deepseekBaseUrl: "https://deepseek.example/v1",
		deepseekModel: "deepseek-reasoner",
	};
	const payload = buildDeepSeekKnowledgeProposalPayload(request, settings);
	const serialized = JSON.stringify(payload);

	assert.equal(payload.endpoint, "https://deepseek.example/v1/chat/completions");
	assert.equal(payload.model, "deepseek-reasoner");
	assert.equal(payload.response_format.type, "json_object");
	assert.equal(payload.messages?.length, 2);
	assert.equal(payload.input, undefined);
	assert.equal(serialized.includes("mneme.ai.proposals.v1"), true);
	assert.equal(serialized.includes("new_card"), true);
	assert.equal(serialized.includes("Copy sourcePath exactly into source.path"), true);
	assert.equal(serialized.includes("deepseek-secret-value"), false);
	assert.equal(serialized.includes("Encapsulation keeps object internals hidden"), false);
	assert.equal(serialized.includes("Encapsulation keeps"), true);
}

{
	const provider = new OpenAiProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: false,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	await assert.rejects(
		() => provider.generateKnowledgeProposals(request),
		/OpenAI API key is required to use the OpenAI provider/,
	);
}

{
	const provider = new DeepSeekProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: false,
		aiProvider: "deepseek",
		deepseekApiKey: "",
	});

	await assert.rejects(
		() => provider.generateKnowledgeProposals(request),
		/DeepSeek API key is required to use the DeepSeek provider/,
	);
}

{
	const http = new FakeHttpClient({
		output: [{
			content: [{ type: "output_text", text: JSON.stringify(createStructuredResponse()) }],
		}],
	});
	const provider = new OpenAiProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai",
		openaiApiKey: "sk-test-only",
	}, http);
	const response = await provider.generateKnowledgeProposals(request);

	assert.equal(validateAiStructuredProposalResponse(response.structuredResponse).valid, true);
	assert.equal(http.lastRequest?.url, "https://api.openai.com/v1/responses");
	assert.equal(http.lastRequest?.headers.Authorization, "Bearer sk-test-only");
	assert.equal(response.provider.structuredOutput, "json_schema");
	assert.equal(JSON.stringify(response.diagnostics).includes("sk-test-only"), false);
}

{
	const http = new FakeHttpClient({
		choices: [{ message: { content: JSON.stringify(createStructuredResponse()) } }],
	});
	const provider = new DeepSeekProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "deepseek",
		deepseekApiKey: "deepseek-test-only",
	}, http);
	const response = await provider.generateKnowledgeProposals(request);

	assert.equal(validateAiStructuredProposalResponse(response.structuredResponse).valid, true);
	assert.equal(http.lastRequest?.url, "https://api.deepseek.com/chat/completions");
	assert.equal(http.lastRequest?.headers.Authorization, "Bearer deepseek-test-only");
	assert.equal(response.provider.structuredOutput, "json_object");
	assert.equal(JSON.stringify(response.diagnostics).includes("deepseek-test-only"), false);
}

{
	const provider = new OpenAiProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai",
		openaiApiKey: "sk-test-only",
	}, new FakeHttpClient({ output: [] }));

	await assert.rejects(
		() => provider.generateKnowledgeProposals(request),
		/OpenAI response did not contain structured proposal JSON/,
	);
}

{
	assert.equal(createAiProvider(DEFAULT_SETTINGS) instanceof MockAiProvider, true);
	assert.equal(createAiProvider({
		...DEFAULT_SETTINGS,
		aiProvider: "openai",
	}) instanceof OpenAiProvider, true);
	assert.equal(createAiProvider({
		...DEFAULT_SETTINGS,
		aiProvider: "deepseek",
	}) instanceof DeepSeekProvider, true);
}

console.log("AI provider tests passed.");
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});

function createStructuredResponse() {
	return {
		mode: "concept_capture",
		proposals: [],
		schemaVersion: "mneme.ai.proposals.v1",
		source: { hash: request.sourceHash, path: request.sourcePath },
		warnings: [],
	};
}

function readRequestContext(payload: {
	input?: Array<{ content: string }>;
	messages?: Array<{ content: string }>;
}): {
	languageContract?: {
		outputLanguage?: string;
		outputLanguageCode?: string;
	};
	existingTags?: string[];
} {
	const content = payload.input?.find(({ content: value }) => value.startsWith("{"))?.content
		?? payload.messages?.find(({ content: value }) => value.startsWith("{"))?.content
		?? "{}";

	return JSON.parse(content) as {
		existingTags?: string[];
		languageContract?: {
			outputLanguage?: string;
			outputLanguageCode?: string;
		};
	};
}

class FakeHttpClient implements AiJsonHttpClient {
	lastRequest?: Parameters<AiJsonHttpClient["postJson"]>[0];

	constructor(private readonly response: unknown) {
	}

	async postJson(input: Parameters<AiJsonHttpClient["postJson"]>[0]): Promise<unknown> {
		this.lastRequest = input;
		return this.response;
	}
}
