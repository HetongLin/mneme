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
import { MockAiProvider } from "../src/services/mockAiProvider";
import { buildOpenAiKnowledgeProposalPayload, OpenAiProvider } from "../src/services/openAiProvider";

const request = {
	existingConceptSummaries: [{
		conceptId: "concept-encapsulation",
		summary: "Bundles data with behavior.",
		title: "Encapsulation",
	}],
	mode: "concept_capture" as const,
	sourceContent: "Encapsulation keeps object internals hidden behind a public interface.",
	sourceHash: "abc123456789",
	sourcePath: "Notes/OOP.md",
};

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
		aiMaxInputChars: 12,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
		openaiModel: "gpt-test",
	};
	const payload = buildOpenAiKnowledgeProposalPayload(request, settings);
	const serialized = JSON.stringify(payload);

	assert.equal(payload.endpoint, "https://api.openai.com/v1/responses");
	assert.equal(payload.model, "gpt-test");
	assert.equal(payload.text?.format.type, "json_schema");
	assert.equal(serialized.includes("sk-secret-value"), false);
	assert.equal(serialized.includes("Encapsulation keeps object internals"), false);
	assert.equal(serialized.includes("Encapsulatio"), true);
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

class FakeHttpClient implements AiJsonHttpClient {
	lastRequest?: Parameters<AiJsonHttpClient["postJson"]>[0];

	constructor(private readonly response: unknown) {
	}

	async postJson(input: Parameters<AiJsonHttpClient["postJson"]>[0]): Promise<unknown> {
		this.lastRequest = input;
		return this.response;
	}
}
