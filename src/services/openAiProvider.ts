import type { MnemeSettings } from "../models/settings";
import type { AiJsonHttpClient, AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig, validateAiProviderConfig } from "./aiProvider";
import {
	buildOpenAiCompatibleKnowledgeProposalPayload,
	OpenAiCompatibleStructuredOutputPayload,
} from "./openAiCompatibleProvider";

export type OpenAiStructuredOutputPayload = OpenAiCompatibleStructuredOutputPayload;

export class OpenAiProvider implements AiProvider {
	constructor(
		private readonly settings: MnemeSettings,
		private readonly httpClient?: AiJsonHttpClient,
	) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		const validation = validateAiProviderConfig(this.settings);

		if (!validation.valid) {
			throw new Error(validation.errors.join(" "));
		}

		if (this.settings.openaiApiKey.trim().length === 0) {
			throw new Error("OpenAI API key is required to use the OpenAI provider.");
		}

		if (!this.httpClient) {
			throw new Error("OpenAI network transport is not configured.");
		}

		const payload = buildOpenAiKnowledgeProposalPayload(input, this.settings);
		const { endpoint, timeoutMs, ...body } = payload;
		const raw = await this.httpClient.postJson({
			body,
			headers: {
				Authorization: `Bearer ${this.settings.openaiApiKey}`,
				"Content-Type": "application/json",
			},
			timeoutMs,
			url: endpoint,
		});
		const structuredResponse = parseOpenAiStructuredResponse(raw);

		return {
			diagnostics: createOpenAiProviderDiagnostics(this.settings, input.sourceContent.length),
			provider: {
				baseUrl: this.settings.openaiBaseUrl,
				model: this.settings.openaiModel,
				provider: "openai",
				structuredOutput: "json_schema",
			},
			structuredResponse,
		};
	}
}

export function buildOpenAiKnowledgeProposalPayload(
	input: AiProposalRequest,
	settings: MnemeSettings,
): OpenAiStructuredOutputPayload {
	return buildOpenAiCompatibleKnowledgeProposalPayload(input, {
		aiCardStyleGuidance: settings.aiCardStyleGuidance,
		aiConceptStyleGuidance: settings.aiConceptStyleGuidance,
		baseUrl: settings.openaiBaseUrl,
		endpointPath: "responses",
		maxInputChars: settings.aiMaxInputChars,
		model: settings.openaiModel,
		requestShape: "responses",
		timeoutMs: settings.aiRequestTimeoutMs,
	});
}

export function createOpenAiProviderDiagnostics(settings: MnemeSettings, sourceContentLength: number): AiProposalResponse["diagnostics"] {
	return {
		inputChars: sourceContentLength,
		logSafeConfig: toLogSafeAiConfig(settings),
		warnings: [],
	};
}

function parseOpenAiStructuredResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.output)) {
		throw new Error("OpenAI response did not contain structured proposal JSON.");
	}

	for (const output of raw.output) {
		if (!isRecord(output) || !Array.isArray(output.content)) {
			continue;
		}

		for (const content of output.content) {
			if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
				return parseJson(content.text, "OpenAI");
			}
		}
	}

	throw new Error("OpenAI response did not contain structured proposal JSON.");
}

function parseJson(value: string, provider: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		throw new Error(`${provider} response contained invalid JSON.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
