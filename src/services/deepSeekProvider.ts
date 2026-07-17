import type { MnemeSettings } from "../models/settings";
import type { AiJsonHttpClient, AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig, validateAiProviderConfig } from "./aiProvider";
import {
	buildOpenAiCompatibleKnowledgeProposalPayload,
	OpenAiCompatibleStructuredOutputPayload,
} from "./openAiCompatibleProvider";

export type DeepSeekStructuredOutputPayload = OpenAiCompatibleStructuredOutputPayload;

export class DeepSeekProvider implements AiProvider {
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

		if (this.settings.deepseekApiKey.trim().length === 0) {
			throw new Error("DeepSeek API key is required to use the DeepSeek provider.");
		}

		if (!this.httpClient) {
			throw new Error("DeepSeek network transport is not configured.");
		}

		const payload = buildDeepSeekKnowledgeProposalPayload(input, this.settings);
		const { endpoint, timeoutMs, ...body } = payload;
		const raw = await this.httpClient.postJson({
			body,
			headers: {
				Authorization: `Bearer ${this.settings.deepseekApiKey}`,
				"Content-Type": "application/json",
			},
			timeoutMs,
			url: endpoint,
		});
		const structuredResponse = parseDeepSeekStructuredResponse(raw);

		return {
			diagnostics: createDeepSeekProviderDiagnostics(this.settings, input.sourceContent.length),
			provider: {
				baseUrl: this.settings.deepseekBaseUrl,
				model: this.settings.deepseekModel,
				provider: "deepseek",
				structuredOutput: "json_object",
			},
			structuredResponse,
		};
	}
}

export function buildDeepSeekKnowledgeProposalPayload(
	input: AiProposalRequest,
	settings: MnemeSettings,
): DeepSeekStructuredOutputPayload {
	return buildOpenAiCompatibleKnowledgeProposalPayload(input, {
		aiCardStyleGuidance: settings.aiCardStyleGuidance,
		aiConceptStyleGuidance: settings.aiConceptStyleGuidance,
		baseUrl: settings.deepseekBaseUrl,
		endpointPath: "chat/completions",
		maxInputChars: settings.aiMaxInputChars,
		model: settings.deepseekModel,
		requestShape: "chat_completions",
		timeoutMs: settings.aiRequestTimeoutMs,
	});
}

export function createDeepSeekProviderDiagnostics(settings: MnemeSettings, sourceContentLength: number): AiProposalResponse["diagnostics"] {
	return {
		inputChars: sourceContentLength,
		logSafeConfig: toLogSafeAiConfig(settings),
		warnings: [],
	};
}

function parseDeepSeekStructuredResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.choices)) {
		throw new Error("DeepSeek response did not contain structured proposal JSON.");
	}

	const choice = raw.choices[0];
	const message = isRecord(choice) ? choice.message : undefined;
	const content = isRecord(message) ? message.content : undefined;

	if (typeof content !== "string") {
		throw new Error("DeepSeek response did not contain structured proposal JSON.");
	}

	try {
		return JSON.parse(content);
	} catch {
		throw new Error("DeepSeek response contained invalid JSON.");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
