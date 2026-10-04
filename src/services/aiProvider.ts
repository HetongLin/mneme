import type { CardDraftType, KnowledgeProposal, KnowledgeProposalKind } from "../models/knowledgeProposal";
import type { AiProviderName, MnemeSettings } from "../models/settings";
import { ADDITIONAL_AI_PROVIDER_NAMES, getAiProviderConnection, isAdditionalAiProviderName, isAiProviderName, type AiApiProtocol, type AdditionalAiProviderName } from "../models/aiProviderCatalog";
import { getAiConnectionIssues } from "./aiJsonProtocol";
export type AiProposalMode = "concept_capture" | "card_generation";

export interface AiSourceChunkContext {
	end: number;
	index: number;
	start: number;
	total: number;
	totalChars: number;
}

interface AiProposalRequestBase {
	mode: AiProposalMode;
	sourceContent: string;
	sourceHash: string;
	sourcePath: string;
}

export interface AiConceptCaptureRequest extends AiProposalRequestBase {
	languageReferenceContent?: string;
	mode: "concept_capture";
	sourceChunk?: AiSourceChunkContext;
}

export interface AiCardGenerationRequest extends AiProposalRequestBase {
	conceptId: string;
	conceptTitle: string;
	definitionRequired?: boolean;
	existingCardFronts: string[];
	mode: "card_generation";
}

export type AiProposalRequest = AiConceptCaptureRequest | AiCardGenerationRequest;

export interface AiProviderMetadata {
	baseUrl?: string;
	model?: string;
	provider: AiProviderName;
	structuredOutput: "json_object" | "json_schema" | "prompt_json" | "mock";
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

export function formatAiHttpResponseError(
	status: number,
	json: unknown,
	text: string,
): string {
	const details = extractAiHttpErrorDetails(json)
		?? normalizeAiHttpErrorText(text);

	return details
		? `AI provider request failed (${status}): ${details}`
		: `AI provider request failed (${status}).`;
}

export function redactAiRequestSecrets(message: string, headers: Record<string, string>): string {
	let safe = message;
	for (const [name, value] of Object.entries(headers)) {
		if (!["authorization", "x-api-key", "x-goog-api-key"].includes(name.toLowerCase())) continue;
		const secret = value.replace(/^Bearer\s+/iu, "").trim();
		if (secret) safe = safe.split(secret).join("[redacted]");
	}
	return safe;
}

export interface LogSafeAiConfig {
	aiProviderProfiles: Record<AdditionalAiProviderName, {
		apiKeyConfigured: boolean;
		baseUrl: string;
		model: string;
		protocol: AiApiProtocol;
		jsonMode: boolean;
		maxOutputTokens: number;
	}>;
	allowedAiCardTypes: CardDraftType[];
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
	suggestEnglishAliases: boolean;
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

	if (!isAiProviderName(settings.aiProvider)) {
		errors.push("Select a supported AI provider.");
	} else if (isAdditionalAiProviderName(settings.aiProvider)) {
		errors.push(...getAiConnectionIssues(getAiProviderConnection(settings), settings.aiCaptureEnabled));
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
	const profiles = {} as LogSafeAiConfig["aiProviderProfiles"];
	for (const name of ADDITIONAL_AI_PROVIDER_NAMES) {
		const profile = settings.aiProviderProfiles[name];
		profiles[name] = {
			apiKeyConfigured: profile.apiKey.trim().length > 0,
			baseUrl: toLogSafeBaseUrl(profile.baseUrl),
			model: profile.model, protocol: profile.protocol,
			jsonMode: profile.jsonMode, maxOutputTokens: profile.maxOutputTokens,
		};
	}
	return {
		aiProviderProfiles: profiles,
		allowedAiCardTypes: [...settings.allowedAiCardTypes],
		aiCaptureEnabled: settings.aiCaptureEnabled,
		aiMaxInputChars: settings.aiMaxInputChars,
		aiProvider: settings.aiProvider,
		aiRequestTimeoutMs: settings.aiRequestTimeoutMs,
		deepseekApiKeyConfigured: settings.deepseekApiKey.trim().length > 0,
		deepseekBaseUrl: toLogSafeBaseUrl(settings.deepseekBaseUrl),
		deepseekModel: settings.deepseekModel,
		openaiApiKeyConfigured: settings.openaiApiKey.trim().length > 0,
		openaiBaseUrl: toLogSafeBaseUrl(settings.openaiBaseUrl),
		openaiModel: settings.openaiModel,
		suggestEnglishAliases: settings.suggestEnglishAliases,
	};
}

export function validateConceptCaptureResponse(proposals: KnowledgeProposal[]): AiProposalValidationResult {
	const errors = proposals
		.filter((proposal) => !CONCEPT_CAPTURE_PROPOSAL_KINDS.includes(proposal.kind))
		.map((proposal) => `Concept capture must not return unsupported ${proposal.kind} proposals.`);

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

function extractAiHttpErrorDetails(value: unknown): string | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.error === "string") return normalizeAiHttpErrorText(value.error);
	if (isRecord(value.error) && typeof value.error.message === "string") {
		return normalizeAiHttpErrorText(value.error.message);
	}
	if (typeof value.message === "string") return normalizeAiHttpErrorText(value.message);
	return undefined;
}

function normalizeAiHttpErrorText(value: string): string | undefined {
	const normalized = value.replace(/\s+/gu, " ").trim();
	return normalized ? normalized.slice(0, 500) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toLogSafeBaseUrl(value: string): string {
	try {
		const url = new URL(value);
		url.username = ""; url.password = ""; url.search = ""; url.hash = "";
		return url.toString().replace(/\/+$/u, "");
	} catch {
		return value ? "(invalid URL)" : "";
	}
}
