import type { MnemeSettings } from "../models/settings";
import { computeContentHash } from "../utils/sourceHash";

export const AI_CONCEPT_CAPTURE_MAX_CHUNK_CHARS = 6000;
export const AI_CONCEPT_CAPTURE_POLICY_VERSION = "mneme.concept-capture.2026-07-19.1";
export const AI_CARD_GENERATION_POLICY_VERSION = "mneme.card-generation.2026-07-18.3";
export const AI_SOURCE_CHUNKING_VERSION = 1;

export async function createAiConceptCaptureFingerprint(
	contentHash: string,
	sourcePath: string,
	settings: MnemeSettings,
): Promise<string> {
	const providerConfig = settings.aiProvider === "openai"
		? { baseUrl: settings.openaiBaseUrl, model: settings.openaiModel }
		: settings.aiProvider === "deepseek"
			? { baseUrl: settings.deepseekBaseUrl, model: settings.deepseekModel }
			: { baseUrl: "mock", model: "mock" };

	return computeContentHash(JSON.stringify({
		configuredChunkSize: settings.aiMaxInputChars,
		effectiveChunkSize: getEffectiveConceptCaptureChunkSize(settings),
		chunkingVersion: AI_SOURCE_CHUNKING_VERSION,
		contentHash,
		maxExtractionChunkSize: AI_CONCEPT_CAPTURE_MAX_CHUNK_CHARS,
		policyVersion: AI_CONCEPT_CAPTURE_POLICY_VERSION,
		provider: settings.aiProvider,
		providerConfig,
		sourcePath,
		suggestEnglishAliases: settings.suggestEnglishAliases,
	}));
}

export function getEffectiveConceptCaptureChunkSize(settings: MnemeSettings): number {
	return Math.min(settings.aiMaxInputChars, AI_CONCEPT_CAPTURE_MAX_CHUNK_CHARS);
}

export async function createAiCardGenerationFingerprint(
	learningContentHash: string,
	conceptPath: string,
	settings: MnemeSettings,
): Promise<string> {
	const providerConfig = settings.aiProvider === "openai"
		? { baseUrl: settings.openaiBaseUrl, model: settings.openaiModel }
		: settings.aiProvider === "deepseek"
			? { baseUrl: settings.deepseekBaseUrl, model: settings.deepseekModel }
			: { baseUrl: "mock", model: "mock" };

	return computeContentHash(JSON.stringify({
		chunkSize: settings.aiMaxInputChars,
		chunkingVersion: AI_SOURCE_CHUNKING_VERSION,
		conceptPath,
		learningContentHash,
		policyVersion: AI_CARD_GENERATION_POLICY_VERSION,
		provider: settings.aiProvider,
		providerConfig,
		allowedCardTypes: settings.allowedAiCardTypes,
	}));
}
