import assert from "node:assert/strict";
import {
	DEFAULT_SETTINGS,
	getSettingsFromPluginData,
	mergeSettingsIntoPluginData,
	normalizeSettings,
} from "../src/models/settings";

{
	assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
	assert.deepEqual(getSettingsFromPluginData(undefined), DEFAULT_SETTINGS);
}

{
	const settings = getSettingsFromPluginData({
		settings: {
			aiCaptureEnabled: true,
			aiMaxInputChars: 12000,
			aiProvider: "openai",
			aiRequestTimeoutMs: 45000,
			cardsFolder: "Custom/Cards",
			conceptsFolder: "Custom/Concepts",
			enableDeveloperTools: true,
			fsrsEnableFuzz: true,
			fsrsMaximumInterval: 365,
			fsrsRequestRetention: 0.85,
			openaiApiKey: "sk-test",
			openaiBaseUrl: "https://example.test/v1/",
			openaiModel: "gpt-test",
		},
	});

	assert.deepEqual(settings, {
		aiCaptureEnabled: true,
		aiMaxInputChars: 12000,
		aiProvider: "openai",
		aiRequestTimeoutMs: 45000,
		cardsFolder: "Custom/Cards",
		conceptsFolder: "Custom/Concepts",
		enableDeveloperTools: true,
		fsrsEnableFuzz: true,
		fsrsMaximumInterval: 365,
		fsrsRequestRetention: 0.85,
		openaiApiKey: "sk-test",
		openaiBaseUrl: "https://example.test/v1",
		openaiModel: "gpt-test",
	});
}

{
	const settings = normalizeSettings({
		aiCaptureEnabled: "yes",
		aiMaxInputChars: -10,
		aiProvider: "local",
		aiRequestTimeoutMs: 0,
		cardsFolder: "",
		conceptsFolder: " /Custom//Concepts/ ",
		enableDeveloperTools: "yes",
		fsrsEnableFuzz: "yes",
		fsrsMaximumInterval: -10,
		fsrsRequestRetention: 1.5,
		openaiApiKey: 123,
		openaiBaseUrl: "",
		openaiModel: "",
	});

	assert.deepEqual(settings, {
		aiCaptureEnabled: DEFAULT_SETTINGS.aiCaptureEnabled,
		aiMaxInputChars: 1,
		aiProvider: DEFAULT_SETTINGS.aiProvider,
		aiRequestTimeoutMs: 1,
		cardsFolder: DEFAULT_SETTINGS.cardsFolder,
		conceptsFolder: "Custom/Concepts",
		enableDeveloperTools: false,
		fsrsEnableFuzz: DEFAULT_SETTINGS.fsrsEnableFuzz,
		fsrsMaximumInterval: 1,
		fsrsRequestRetention: 0.98,
		openaiApiKey: DEFAULT_SETTINGS.openaiApiKey,
		openaiBaseUrl: DEFAULT_SETTINGS.openaiBaseUrl,
		openaiModel: DEFAULT_SETTINGS.openaiModel,
	});
}

{
	const settings = normalizeSettings({});

	assert.equal(settings.enableDeveloperTools, false);
	assert.equal(settings.aiCaptureEnabled, false);
	assert.equal(settings.aiProvider, "mock");
}

{
	const data = mergeSettingsIntoPluginData({
		conceptSourceLinks: {
			"link-a": {
				addedAt: "2026-01-01T12:00:00.000Z",
				conceptId: "concept-a",
				id: "link-a",
				lastSeenAt: "2026-01-01T12:00:00.000Z",
				relationType: "origin",
				sourcePath: "Notes/Intro.md",
				status: "approved",
			},
		},
		knowledgeProposals: {
			"proposal-a": {
				createdAt: "2026-01-01T12:00:00.000Z",
				id: "proposal-a",
				kind: "new_concept",
				payload: {
					title: "Encapsulation",
				},
				status: "suggested",
				updatedAt: "2026-01-01T12:00:00.000Z",
			},
		},
		reviewStates: {
			"encapsulation-basic": {
				cardId: "encapsulation-basic",
				createdAt: "2026-01-01T12:00:00.000Z",
				lapseCount: 0,
				reviewCount: 1,
				updatedAt: "2026-01-01T12:00:00.000Z",
			},
		},
		schemaVersion: 1,
		sourceAnalysisRecords: {
			"Notes/Intro.md": {
				contentHash: "source-hash",
				lastAnalyzedAt: "2026-01-01T12:00:00.000Z",
				linkedConceptIds: ["concept-a"],
				mtime: 100,
				pendingProposalIds: ["proposal-a"],
				size: 200,
				sourcePath: "Notes/Intro.md",
				status: "clean",
			},
		},
	}, {
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiMaxInputChars: 10000,
		aiProvider: "openai",
		aiRequestTimeoutMs: 15000,
		fsrsRequestRetention: 0.82,
		openaiApiKey: "sk-updated",
	});

	assert.equal((data.settings as typeof DEFAULT_SETTINGS).fsrsRequestRetention, 0.82);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).aiProvider, "openai");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).aiCaptureEnabled, true);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).openaiApiKey, "sk-updated");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).cardsFolder, DEFAULT_SETTINGS.cardsFolder);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).conceptsFolder, DEFAULT_SETTINGS.conceptsFolder);
	assert.equal(typeof data.reviewStates, "object");
	assert.equal(typeof data.sourceAnalysisRecords, "object");
	assert.equal(typeof data.knowledgeProposals, "object");
	assert.equal(typeof data.conceptSourceLinks, "object");
	assert.equal((data.reviewStates as Record<string, unknown>)["encapsulation-basic"] !== undefined, true);
	assert.equal((data.sourceAnalysisRecords as Record<string, unknown>)["Notes/Intro.md"] !== undefined, true);
	assert.equal((data.knowledgeProposals as Record<string, unknown>)["proposal-a"] !== undefined, true);
	assert.equal((data.conceptSourceLinks as Record<string, unknown>)["link-a"] !== undefined, true);
}

console.log("Settings tests passed.");
