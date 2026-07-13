import type { KnowledgeProposal, KnowledgeProposalKind } from "../models/knowledgeProposal";
import type { AiProviderName, MnemeSettings } from "../models/settings";
export type AiProposalMode = "concept_capture" | "card_generation";

export interface ExistingConceptSummary {
	conceptId: string;
	summary?: string;
	title: string;
}

interface AiProposalRequestBase {
	mode: AiProposalMode;
	sourceContent: string;
	sourceHash: string;
	sourcePath: string;
}

export interface AiConceptCaptureRequest extends AiProposalRequestBase {
	existingConceptSummaries: ExistingConceptSummary[];
	mode: "concept_capture";
}

export interface AiCardGenerationRequest extends AiProposalRequestBase {
	conceptId: string;
	conceptTitle: string;
	existingCardFronts: string[];
	mode: "card_generation";
}

export type AiProposalRequest = AiConceptCaptureRequest | AiCardGenerationRequest;

export interface AiProviderMetadata {
	baseUrl?: string;
	model?: string;
	provider: AiProviderName;
	structuredOutput: "json_object" | "json_schema" | "mock";
}

export interface AiProposalDiagnostics {
	inputChars: number;
	logSafeConfig: LogSafeAiConfig;
	warnings: string[];
}

export interface AiProposalResponse {
	diagnostics: AiProposalDiagnostics;
	provider: AiProviderMetadata;
	structuredResponse: unknown;
}

export interface AiProvider {
	generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse>;
}

export interface AiJsonHttpRequest {
	body: unknown;
	headers: Record<string, string>;
	timeoutMs: number;
	url: string;
}

export interface AiJsonHttpClient {
	postJson(input: AiJsonHttpRequest): Promise<unknown>;
}

export interface LogSafeAiConfig {
	aiCaptureEnabled: boolean;
	aiMaxInputChars: number;
	aiProvider: AiProviderName;
	aiRequestTimeoutMs: number;
	deepseekApiKeyConfigured: boolean;
	deepseekBaseUrl: string;
	deepseekModel: string;
	openaiApiKeyConfigured: boolean;
	openaiBaseUrl: string;
	openaiModel: string;
}

export interface AiProviderConfigValidationResult {
	errors: string[];
	logSafeConfig: LogSafeAiConfig;
	valid: boolean;
	warnings: string[];
}

export interface AiProposalValidationResult {
	errors: string[];
	valid: boolean;
	warnings: string[];
}

export const CONCEPT_CAPTURE_PROPOSAL_KINDS: KnowledgeProposalKind[] = [
	"new_concept",
	"link_existing_concept",
	"add_view",
	"update_concept",
	"merge_concept",
];

export const CARD_STAGE_PROPOSAL_KINDS: KnowledgeProposalKind[] = [
	"new_card",
	"revise_card",
	"split_card",
	"merge_card",
	"retire_card",
];

export function validateAiProviderConfig(settings: MnemeSettings): AiProviderConfigValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (settings.aiProvider !== "mock" && settings.aiProvider !== "openai" && settings.aiProvider !== "deepseek") {
		errors.push("AI provider must be mock, openai, or deepseek.");
	}

	if (settings.aiRequestTimeoutMs < 1) {
		errors.push("AI request timeout must be at least 1 millisecond.");
	}

	if (settings.aiMaxInputChars < 1) {
		errors.push("AI max input characters must be at least 1.");
	}

	if (settings.aiProvider === "openai" && settings.aiCaptureEnabled && settings.openaiApiKey.trim().length === 0) {
		errors.push("OpenAI API key is required when AI capture is enabled with the OpenAI provider.");
	}

	if (settings.aiProvider === "openai" && settings.openaiModel.trim().length === 0) {
		errors.push("OpenAI model is required when using the OpenAI provider.");
	}

	if (settings.aiProvider === "openai" && settings.openaiBaseUrl.trim().length === 0) {
		errors.push("OpenAI base URL is required when using the OpenAI provider.");
	}

	if (settings.aiProvider === "deepseek" && settings.aiCaptureEnabled && settings.deepseekApiKey.trim().length === 0) {
		errors.push("DeepSeek API key is required when AI capture is enabled with the DeepSeek provider.");
	}

	if (settings.aiProvider === "deepseek" && settings.deepseekModel.trim().length === 0) {
		errors.push("DeepSeek model is required when using the DeepSeek provider.");
	}

	if (settings.aiProvider === "deepseek" && settings.deepseekBaseUrl.trim().length === 0) {
		errors.push("DeepSeek base URL is required when using the DeepSeek provider.");
	}

	if (!settings.aiCaptureEnabled) {
		warnings.push("AI capture is disabled.");
	}

	return {
		errors,
		logSafeConfig: toLogSafeAiConfig(settings),
		valid: errors.length === 0,
		warnings,
	};
}

export function toLogSafeAiConfig(settings: MnemeSettings): LogSafeAiConfig {
	return {
		aiCaptureEnabled: settings.aiCaptureEnabled,
		aiMaxInputChars: settings.aiMaxInputChars,
		aiProvider: settings.aiProvider,
		aiRequestTimeoutMs: settings.aiRequestTimeoutMs,
		deepseekApiKeyConfigured: settings.deepseekApiKey.trim().length > 0,
		deepseekBaseUrl: settings.deepseekBaseUrl,
		deepseekModel: settings.deepseekModel,
		openaiApiKeyConfigured: settings.openaiApiKey.trim().length > 0,
		openaiBaseUrl: settings.openaiBaseUrl,
		openaiModel: settings.openaiModel,
	};
}

export function validateConceptCaptureResponse(proposals: KnowledgeProposal[]): AiProposalValidationResult {
	const errors = proposals
		.filter((proposal) => CARD_STAGE_PROPOSAL_KINDS.includes(proposal.kind))
		.map((proposal) => `Concept capture must not return ${proposal.kind} proposals.`);

	return {
		errors,
		valid: errors.length === 0,
		warnings: [],
	};
}

export function validateCardGenerationResponse(proposals: KnowledgeProposal[]): AiProposalValidationResult {
	const errors = proposals
		.filter((proposal) => proposal.kind !== "new_card")
		.map((proposal) => `Card generation must not return ${proposal.kind} proposals.`);

	return {
		errors,
		valid: errors.length === 0,
		warnings: [],
	};
}
