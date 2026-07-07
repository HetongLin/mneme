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
			aiProvider: "deepseek",
			aiRequestTimeoutMs: 45000,
			cardsPerConceptLimit: 4,
			cardsFolder: "Custom/Cards",
			conceptsFolder: "Custom/Concepts",
			dailyCardLimit: 18,
			dailyConceptLimit: 6,
			deepseekApiKey: "deepseek-test",
			deepseekBaseUrl: "https://deepseek.example/v1/",
			deepseekModel: "deepseek-reasoner",
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
		aiProvider: "deepseek",
		aiRequestTimeoutMs: 45000,
		cardsPerConceptLimit: 4,
		cardsFolder: "Custom/Cards",
		conceptsFolder: "Custom/Concepts",
		dailyCardLimit: 18,
		dailyConceptLimit: 6,
		deepseekApiKey: "deepseek-test",
		deepseekBaseUrl: "https://deepseek.example/v1",
		deepseekModel: "deepseek-reasoner",
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
		cardsPerConceptLimit: -5,
		cardsFolder: "",
		conceptsFolder: " /Custom//Concepts/ ",
		dailyCardLimit: 0,
		dailyConceptLimit: 3.7,
		deepseekApiKey: 456,
		deepseekBaseUrl: "",
		deepseekModel: "",
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
		cardsPerConceptLimit: 1,
		cardsFolder: DEFAULT_SETTINGS.cardsFolder,
		conceptsFolder: "Custom/Concepts",
		dailyCardLimit: 1,
		dailyConceptLimit: 4,
		deepseekApiKey: DEFAULT_SETTINGS.deepseekApiKey,
		deepseekBaseUrl: DEFAULT_SETTINGS.deepseekBaseUrl,
		deepseekModel: DEFAULT_SETTINGS.deepseekModel,
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
	assert.equal(settings.deepseekApiKey, "");
	assert.equal(settings.deepseekBaseUrl, "https://api.deepseek.com");
	assert.equal(settings.deepseekModel, "deepseek-v4-flash");
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
		aiProvider: "deepseek",
		aiRequestTimeoutMs: 15000,
		deepseekApiKey: "deepseek-updated",
		deepseekBaseUrl: "https://deepseek.example",
		deepseekModel: "deepseek-reasoner",
		enableDeveloperTools: true,
		fsrsRequestRetention: 0.82,
		fsrsEnableFuzz: true,
		openaiApiKey: "sk-updated",
	});

	assert.equal((data.settings as typeof DEFAULT_SETTINGS).fsrsRequestRetention, 0.82);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).fsrsEnableFuzz, true);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).enableDeveloperTools, true);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).aiProvider, "deepseek");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).aiCaptureEnabled, true);
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).openaiApiKey, "sk-updated");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).deepseekApiKey, "deepseek-updated");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).deepseekBaseUrl, "https://deepseek.example");
	assert.equal((data.settings as typeof DEFAULT_SETTINGS).deepseekModel, "deepseek-reasoner");
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
