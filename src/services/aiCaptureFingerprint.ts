import type { MnemeSettings } from "../models/settings";
import { computeContentHash } from "../utils/sourceHash";

export const AI_CONCEPT_CAPTURE_POLICY_VERSION = "mneme.concept-capture.2026-07-14.1";
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
		chunkSize: settings.aiMaxInputChars,
		chunkingVersion: AI_SOURCE_CHUNKING_VERSION,
		contentHash,
		policyVersion: AI_CONCEPT_CAPTURE_POLICY_VERSION,
		provider: settings.aiProvider,
		providerConfig,
		sourcePath,
	}));
}
