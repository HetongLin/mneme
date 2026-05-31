import type { KnowledgeProposal, KnowledgeProposalKind } from "../models/knowledgeProposal";
import type { AiProviderName, MnemeSettings } from "../models/settings";

export type AiProposalMode = "concept_capture";

export interface ExistingConceptSummary {
	conceptId: string;
	summary?: string;
	title: string;
}

export interface AiProposalRequest {
	existingConceptSummaries: ExistingConceptSummary[];
	mode: AiProposalMode;
	sourceContent: string;
	sourceHash: string;
	sourcePath: string;
}

export interface AiProviderMetadata {
	baseUrl?: string;
	model?: string;
	provider: AiProviderName;
	structuredOutput: "planned" | "mock";
}

export interface AiProposalDiagnostics {
	inputChars: number;
	logSafeConfig: LogSafeAiConfig;
	warnings: string[];
}

export interface AiProposalResponse {
	diagnostics: AiProposalDiagnostics;
	proposals: KnowledgeProposal[];
	provider: AiProviderMetadata;
}

export interface AiProvider {
	generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse>;
}

export interface LogSafeAiConfig {
	aiCaptureEnabled: boolean;
	aiMaxInputChars: number;
	aiProvider: AiProviderName;
	aiRequestTimeoutMs: number;
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

	if (settings.aiProvider !== "mock" && settings.aiProvider !== "openai") {
		errors.push("AI provider must be mock or openai.");
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
