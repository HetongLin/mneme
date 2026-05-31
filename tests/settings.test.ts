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
			cardsFolder: "Custom/Cards",
			conceptsFolder: "Custom/Concepts",
			enableDeveloperTools: true,
			fsrsEnableFuzz: true,
			fsrsMaximumInterval: 365,
			fsrsRequestRetention: 0.85,
		},
	});

	assert.deepEqual(settings, {
		cardsFolder: "Custom/Cards",
		conceptsFolder: "Custom/Concepts",
		enableDeveloperTools: true,
		fsrsEnableFuzz: true,
		fsrsMaximumInterval: 365,
		fsrsRequestRetention: 0.85,
	});
}

{
	const settings = normalizeSettings({
		cardsFolder: "",
		conceptsFolder: " /Custom//Concepts/ ",
		enableDeveloperTools: "yes",
		fsrsEnableFuzz: "yes",
		fsrsMaximumInterval: -10,
		fsrsRequestRetention: 1.5,
	});

	assert.deepEqual(settings, {
		cardsFolder: DEFAULT_SETTINGS.cardsFolder,
		conceptsFolder: "Custom/Concepts",
		enableDeveloperTools: false,
		fsrsEnableFuzz: DEFAULT_SETTINGS.fsrsEnableFuzz,
		fsrsMaximumInterval: 1,
		fsrsRequestRetention: 0.98,
	});
}

{
	const settings = normalizeSettings({});

	assert.equal(settings.enableDeveloperTools, false);
}

{
	const data = mergeSettingsIntoPluginData({
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
	}, {
		...DEFAULT_SETTINGS,
		fsrsRequestRetention: 0.82,
	});

	assert.equal((data.settings as typeof DEFAULT_SETTINGS).fsrsRequestRetention, 0.82);
	assert.equal(typeof data.reviewStates, "object");
}

console.log("Settings tests passed.");
