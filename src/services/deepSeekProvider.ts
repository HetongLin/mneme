import type { MnemeSettings } from "../models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig, validateAiProviderConfig } from "./aiProvider";
import {
	buildOpenAiCompatibleKnowledgeProposalPayload,
	OpenAiCompatibleStructuredOutputPayload,
} from "./openAiCompatibleProvider";

export type DeepSeekStructuredOutputPayload = OpenAiCompatibleStructuredOutputPayload;

export class DeepSeekProvider implements AiProvider {
	constructor(private readonly settings: MnemeSettings) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		const validation = validateAiProviderConfig(this.settings);

		if (!validation.valid) {
			throw new Error(validation.errors.join(" "));
		}

		if (this.settings.deepseekApiKey.trim().length === 0) {
			throw new Error("DeepSeek API key is required to use the DeepSeek provider.");
		}

		if (input.mode !== "concept_capture") {
			throw new Error(`Unsupported AI proposal mode: ${input.mode}`);
		}

		buildDeepSeekKnowledgeProposalPayload(input, this.settings);

		throw new Error("DeepSeek AI capture is an infrastructure shell and is not connected to network execution yet.");
	}
}

export function buildDeepSeekKnowledgeProposalPayload(
	input: AiProposalRequest,
	settings: MnemeSettings,
): DeepSeekStructuredOutputPayload {
	return buildOpenAiCompatibleKnowledgeProposalPayload(input, {
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
		warnings: ["DeepSeek provider is OpenAI-compatible shell infrastructure; network execution is not enabled in Task 026A.1."],
	};
}
