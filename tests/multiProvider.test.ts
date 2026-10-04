import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type MnemeSettings } from "../src/models/settings";
import { getAiProviderConnection, type AdditionalAiProviderName } from "../src/models/aiProviderCatalog";
import type { AiJsonHttpRequest, AiProposalRequest } from "../src/services/aiProvider";
import { toLogSafeAiConfig } from "../src/services/aiProvider";
import { createAiProvider } from "../src/services/aiProviderFactory";
import { buildAiJsonRequest, parseAiJsonResponse } from "../src/services/aiJsonProtocol";

const conceptRequest: AiProposalRequest = {
	languageReferenceContent: "这是一篇中文源笔记，用于确定输出语言。",
	mode: "concept_capture",
	sourceContent: "Encapsulation hides representation behind a public interface.",
	sourceHash: "source-hash",
	sourcePath: "Notes/Encapsulation.md",
	sourceChunk: { start: 10, end: 55, index: 1, total: 3, totalChars: 120 },
};

const cardRequest: AiProposalRequest = {
	conceptId: "concept-encapsulation",
	conceptTitle: "Encapsulation",
	existingCardFronts: ["What does encapsulation protect?"],
	mode: "card_generation",
	definitionRequired: true,
	sourceContent: "# Encapsulation\n\n## Core Meaning\n\nEncapsulation protects representation.",
	sourceHash: "concept-hash",
	sourcePath: "Mneme/Concepts/Encapsulation/Concept.md",
};

const proposalJson = JSON.stringify({ proposals: [] });

function settingsFor(provider: AdditionalAiProviderName, profile: Partial<MnemeSettings["aiProviderProfiles"][AdditionalAiProviderName]> = {}): MnemeSettings {
	return {
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: provider,
		aiProviderProfiles: {
			...DEFAULT_SETTINGS.aiProviderProfiles,
			[provider]: {
				...DEFAULT_SETTINGS.aiProviderProfiles[provider],
				apiKey: provider === "custom" ? "" : `${provider}-secret`,
				baseUrl: `https://${provider}.example.test/v1`,
				model: `${provider}-model`,
				...profile,
			},
		},
	};
}

function rawResponse(settings: MnemeSettings): unknown {
	const protocol = getAiProviderConnection(settings).protocol;
	if (protocol === "anthropic_messages") return { content: [{ type: "text", text: proposalJson }], stop_reason: "end_turn" };
	if (protocol === "gemini_generate_content") return { candidates: [{ content: { parts: [{ text: proposalJson }] }, finishReason: "STOP" }] };
	if (protocol === "responses") return { output: [{ content: [{ type: "output_text", text: proposalJson }] }], status: "completed" };
	return { choices: [{ finish_reason: "stop", message: { content: proposalJson } }] };
}

function extractUserContent(request: AiJsonHttpRequest): string {
	const body = request.body as Record<string, unknown>;
	const messages = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : [];
	const message = messages.find((value) => typeof value === "object" && value !== null && (value as { role?: unknown }).role === "user") as { content?: unknown } | undefined;
	if (typeof message?.content === "string") return message.content;
	const contents = Array.isArray(body.contents) ? body.contents : [];
	const parts = contents[0] && typeof contents[0] === "object" ? (contents[0] as { parts?: unknown }).parts : undefined;
	const part = Array.isArray(parts) ? parts[0] : undefined;
	return part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "";
}

function extractSystemContent(request: AiJsonHttpRequest): string {
	const body = request.body as Record<string, unknown>;
	if (typeof body.system === "string") return body.system;
	const messages = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : [];
	const message = messages.find((value) => typeof value === "object" && value !== null && (value as { role?: unknown }).role === "system") as { content?: unknown } | undefined;
	if (typeof message?.content === "string") return message.content;
	const instruction = body.systemInstruction;
	const parts = instruction && typeof instruction === "object" ? (instruction as { parts?: unknown }).parts : undefined;
	const part = Array.isArray(parts) ? parts[0] : undefined;
	return part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "";
}

function extractSchema(request: AiJsonHttpRequest): Record<string, unknown> | undefined {
	const body = request.body as Record<string, unknown>;
	const outputConfig = body.output_config as { format?: { schema?: unknown } } | undefined;
	if (outputConfig?.format?.schema && typeof outputConfig.format.schema === "object") return outputConfig.format.schema as Record<string, unknown>;
	const generationConfig = body.generationConfig as { responseFormat?: { text?: { schema?: unknown } } } | undefined;
	if (generationConfig?.responseFormat?.text?.schema && typeof generationConfig.responseFormat.text.schema === "object") return generationConfig.responseFormat.text.schema as Record<string, unknown>;
	const text = body.text as { format?: { schema?: unknown } } | undefined;
	if (text?.format?.schema && typeof text.format.schema === "object") return text.format.schema as Record<string, unknown>;
	const system = extractSystemContent(request);
	const marker = "Required JSON schema: ";
	const markerIndex = system.indexOf(marker);
	if (markerIndex >= 0) {
		try { return JSON.parse(system.slice(markerIndex + marker.length)) as Record<string, unknown>; } catch { return undefined; }
	}
	return undefined;
}

function assertRequestContext(request: AiJsonHttpRequest, expected: AiProposalRequest): void {
	const userContent = extractUserContent(request);
	if (!userContent) throw new Error(`Missing user content: ${JSON.stringify(request.body)}`);
	const context = JSON.parse(userContent) as Record<string, unknown>;
	if (!context) throw new Error(`Null user context: ${JSON.stringify(request.body)}`);
	if (context.mode === undefined) throw new Error(`Unexpected user context: ${userContent}`);
	assert.equal(context.mode, expected.mode);
	assert.equal(context.sourceContent, expected.sourceContent);
	assert.equal(context.sourceHash, expected.sourceHash);
	assert.equal(context.sourcePath, expected.sourcePath);
	if (expected.mode === "concept_capture") {
		assert.deepEqual(context.sourceChunk, expected.sourceChunk);
		assert.equal(context.languageContract && typeof context.languageContract === "object" && (context.languageContract as { outputLanguageCode?: string }).outputLanguageCode, "zh");
	} else {
		assert.equal(context.conceptId, expected.conceptId);
		assert.equal(context.conceptTitle, expected.conceptTitle);
		assert.deepEqual(context.existingCardFronts, expected.existingCardFronts);
		assert.equal(context.definitionRequired, expected.definitionRequired);
		assert.deepEqual(context.allowedCardTypes, DEFAULT_SETTINGS.allowedAiCardTypes);
	}
	const schema = extractSchema(request);
	const mode = schema?.properties && typeof schema.properties === "object" ? (schema.properties as { mode?: { const?: unknown; enum?: unknown } }).mode : undefined;
	assert.equal(mode?.const === expected.mode || (Array.isArray(mode?.enum) && mode.enum.includes(expected.mode)), true);
}

function assertEnvelope(settings: MnemeSettings, request: AiJsonHttpRequest, expected: AiProposalRequest): void {
	const connection = getAiProviderConnection(settings);
	const serialized = JSON.stringify(request.body);
	if (connection.apiKey) assert.equal(serialized.includes(connection.apiKey), false);
	if (connection.protocol === "anthropic_messages") {
		assert.match(request.url, /\/messages$/);
		assert.equal(request.headers["x-api-key"], connection.apiKey);
		assert.equal(request.headers["anthropic-version"], "2023-06-01");
		assert.equal((request.body as { output_config?: unknown }).output_config !== undefined, true);
	} else if (connection.protocol === "gemini_generate_content") {
		assert.match(request.url, /\/models\/gemini-model:generateContent$/);
		assert.equal(request.headers["x-goog-api-key"], connection.apiKey);
		const generationConfig = (request.body as { generationConfig?: { responseFormat?: { text?: { mimeType?: string; schema?: unknown } } } }).generationConfig;
		assert.equal(generationConfig?.responseFormat?.text?.mimeType, "application/json");
		assert.equal(generationConfig?.responseFormat?.text?.schema !== undefined, true);
	} else if (connection.protocol === "responses") {
		assert.match(request.url, /\/responses$/);
		assert.equal(request.headers.Authorization, undefined);
		assert.equal((request.body as { text?: { format?: { type?: string } } }).text?.format?.type, "json_schema");
	} else {
		assert.match(request.url, /\/chat\/completions$/);
		assert.equal(request.headers.Authorization, connection.apiKey ? `Bearer ${connection.apiKey}` : undefined);
		assert.equal((request.body as { response_format?: { type?: string } }).response_format?.type, "json_object");
		const messages = (request.body as { messages?: Array<{ role?: string; content?: string }> }).messages ?? [];
		assert.equal(messages.some((message) => message.role === "system" && message.content?.includes("Required JSON schema")), true);
		assert.equal((request.body as { enable_thinking?: boolean }).enable_thinking, connection.name === "qwen" ? false : undefined);
	}
	assertRequestContext(request, expected);
}

async function run(): Promise<void> {
	for (const providerName of ["anthropic", "gemini", "qwen", "zhipu", "moonshot", "siliconflow"] as const) {
		const settings = settingsFor(providerName);
		const requests: AiJsonHttpRequest[] = [];
		const provider = createAiProvider(settings, { postJson: async (request) => {
			requests.push(request);
			return rawResponse(settings);
		} });
		const concept = await provider.generateKnowledgeProposals(conceptRequest);
		const card = await provider.generateKnowledgeProposals(cardRequest);
		assert.deepEqual(concept.structuredResponse, { proposals: [] });
		assert.deepEqual(card.structuredResponse, { proposals: [] });
		assert.equal(requests.length, 2);
		assertEnvelope(settings, requests[0], conceptRequest);
		assertEnvelope(settings, requests[1], cardRequest);
	}

	{
		const settings = settingsFor("anthropic");
		const provider = createAiProvider(settings, { postJson: async () => {
			settings.aiProvider = "gemini";
			settings.aiProviderProfiles.gemini.model = "changed-during-request";
			return { content: [{ type: "text", text: proposalJson }], stop_reason: "end_turn" };
		} });
		const response = await provider.generateKnowledgeProposals(conceptRequest);
		assert.deepEqual(response.structuredResponse, { proposals: [] });
		assert.equal(response.provider.provider, "anthropic");
		assert.equal(response.provider.model, "anthropic-model");
		assert.equal(response.provider.baseUrl, "https://anthropic.example.test/v1");
	}

	{
		const settings = settingsFor("custom", { protocol: "responses", baseUrl: "http://127.0.0.1:8765/v1", model: "local-model" });
		const requests: AiJsonHttpRequest[] = [];
		const provider = createAiProvider(settings, { postJson: async (request) => {
			requests.push(request);
			return rawResponse(settings);
		} });
		await provider.generateKnowledgeProposals(conceptRequest);
		await provider.generateKnowledgeProposals(cardRequest);
		assertEnvelope(settings, requests[0], conceptRequest);
		assert.equal(requests[0]?.headers.Authorization, undefined);
	}

	{
		const settings = settingsFor("custom", { jsonMode: false, baseUrl: "http://127.0.0.1:8765/v1", model: "local-model" });
		const requests: AiJsonHttpRequest[] = [];
		const provider = createAiProvider(settings, { postJson: async (request) => {
			requests.push(request);
			return rawResponse(settings);
		} });
		await provider.generateKnowledgeProposals(conceptRequest);
		assert.equal(requests[0]?.url, "http://127.0.0.1:8765/v1/chat/completions");
		assert.equal((requests[0]?.body as { response_format?: unknown }).response_format, undefined);
		assert.equal(requests[0]?.headers.Authorization, undefined);
		const messages = (requests[0]?.body as { messages?: Array<{ role?: string; content?: string }> }).messages ?? [];
		assert.equal(messages.some((message) => message.role === "system" && message.content?.includes("Required JSON schema")), true);
		assert.equal((requests[0]?.body as { enable_thinking?: boolean }).enable_thinking, undefined);
	}

	{
		const anthropic = settingsFor("anthropic");
		assert.throws(() => parseAiJsonResponse(anthropic, { stop_reason: "max_tokens", content: [] }), /truncated/);
		assert.throws(() => parseAiJsonResponse(anthropic, { stop_reason: "refusal", content: [] }), /refused/);
		assert.throws(() => parseAiJsonResponse(anthropic, { stop_reason: "end_turn", content: [{ type: "text", text: "not-json" }] }), /invalid JSON/);
		const gemini = settingsFor("gemini");
		const thoughtThenJson = parseAiJsonResponse(gemini, {
			candidates: [{
				content: { parts: [
					{ thought: true, text: "not-json internal reasoning" },
					{ text: proposalJson },
				] },
				finishReason: "STOP",
			}],
		});
		assert.deepEqual(thoughtThenJson, { proposals: [] });
		assert.throws(() => parseAiJsonResponse(gemini, {}), /no candidate/);
		assert.throws(() => parseAiJsonResponse(gemini, { candidates: [{ finishReason: "SAFETY" }] }), /did not complete/);
		const responses = settingsFor("custom", { protocol: "responses", baseUrl: "http://127.0.0.1:8765/v1", model: "local-model" });
		assert.throws(() => parseAiJsonResponse(responses, { status: "incomplete" }), /did not complete/);
		assert.throws(() => parseAiJsonResponse(responses, { output: [{ content: [{ type: "refusal" }] }] }), /refused/);
		const chat = settingsFor("qwen");
		assert.throws(() => parseAiJsonResponse(chat, { choices: [{ finish_reason: "length", message: { content: "{}" } }] }), /did not complete/);
		assert.throws(() => parseAiJsonResponse(chat, { choices: [{ message: { refusal: "no" } }] }), /refused/);
		assert.throws(() => parseAiJsonResponse(chat, { choices: [{ message: { content: "" } }] }), /did not contain/);
		assert.throws(() => parseAiJsonResponse(chat, { choices: [{ message: { content: "not-json" } }] }), /invalid JSON/);
	}

	{
		const schema = {
			additionalProperties: false,
			properties: { value: { const: "fixed", minLength: 2, minimum: 1, type: "string" } },
			required: ["value"],
			type: "object",
		};
		const originalSchema = structuredClone(schema);
		const request = buildAiJsonRequest(settingsFor("anthropic"), {
			schema,
			schemaName: "test_schema",
			systemPrompt: "Return JSON.",
			userContent: "{}",
		});
		const portable = (request.body as { output_config: { format: { schema: { properties: { value: Record<string, unknown> } } } } }).output_config.format.schema;
		assert.deepEqual(portable.properties.value.enum, ["fixed"]);
		assert.equal(portable.properties.value.minLength, undefined);
		assert.equal(portable.properties.value.minimum, undefined);
		assert.deepEqual(schema, originalSchema);
	}

	{
		let transportCalls = 0;
		const transport = { postJson: async () => { transportCalls += 1; return {}; } };
		for (const settings of [
			settingsFor("anthropic", { apiKey: "" }),
			settingsFor("gemini", { model: "" }),
			settingsFor("qwen", { baseUrl: "https://user:pass@example.test/v1" }),
		]) {
			await assert.rejects(createAiProvider(settings, transport).generateKnowledgeProposals(conceptRequest));
		}
		assert.equal(transportCalls, 0);
	}

	{
		const settings = settingsFor("anthropic");
		const safe = toLogSafeAiConfig(settings);
		const serialized = JSON.stringify(safe);
		assert.equal(serialized.includes("anthropic-secret"), false);
		assert.equal(serialized.includes('"apiKey"'), false);
		assert.equal(serialized.includes('"apiKeyConfigured":true'), true);
	}
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
