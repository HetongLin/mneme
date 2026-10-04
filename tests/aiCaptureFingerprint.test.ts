import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	createAiCardGenerationFingerprint,
	createAiConceptCaptureFingerprint,
} from "../src/services/aiCaptureFingerprint";

async function run(): Promise<void> {
	const baseSettings = {
		...DEFAULT_SETTINGS,
		aiProvider: "anthropic" as const,
		aiProviderProfiles: {
			...DEFAULT_SETTINGS.aiProviderProfiles,
			anthropic: {
				...DEFAULT_SETTINGS.aiProviderProfiles.anthropic,
				apiKey: "selected-secret",
				baseUrl: "https://claude.example/v1",
				model: "claude-test",
				protocol: "anthropic_messages" as const,
				jsonMode: true,
				maxOutputTokens: 4096,
			},
			gemini: {
				...DEFAULT_SETTINGS.aiProviderProfiles.gemini,
				apiKey: "unselected-secret",
				model: "gemini-test",
			},
		},
	};

	const capture = (settings: typeof baseSettings) => createAiConceptCaptureFingerprint("content", "Notes/source.md", settings);
	const cards = (settings: typeof baseSettings) => createAiCardGenerationFingerprint("learning", "Concepts/source.md", settings);
	const baselineCapture = await capture(baseSettings);
	const baselineCards = await cards(baseSettings);

	assert.notEqual(await capture({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			anthropic: { ...baseSettings.aiProviderProfiles.anthropic, model: "claude-other" },
		},
	}), baselineCapture);
	assert.notEqual(await capture({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			anthropic: {
				...baseSettings.aiProviderProfiles.anthropic,
				protocol: "responses" as typeof baseSettings.aiProviderProfiles.anthropic.protocol,
			},
		},
	}), baselineCapture);
	assert.notEqual(await cards({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			anthropic: { ...baseSettings.aiProviderProfiles.anthropic, maxOutputTokens: 8192 },
		},
	}), baselineCards);

	assert.equal(await capture({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			anthropic: { ...baseSettings.aiProviderProfiles.anthropic, apiKey: "rotated-secret" },
		},
	}), baselineCapture);
	assert.equal(await cards({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			anthropic: { ...baseSettings.aiProviderProfiles.anthropic, apiKey: "rotated-secret" },
		},
	}), baselineCards);
	assert.equal(await capture({
		...baseSettings,
		aiProviderProfiles: {
			...baseSettings.aiProviderProfiles,
			gemini: { ...baseSettings.aiProviderProfiles.gemini, model: "gemini-other", baseUrl: "https://other.example" },
		},
	}), baselineCapture);

	console.log("AI capture fingerprint tests passed.");
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
