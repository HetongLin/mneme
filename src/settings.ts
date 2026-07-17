import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	DEFAULT_SETTINGS,
	getRetentionWorkloadWarning,
	MnemeSettings,
	normalizeFolder,
	normalizeMaximumInterval,
	normalizePositiveInteger,
	normalizeRetention,
} from "./models/settings";

export {
	DEFAULT_SETTINGS,
	getSettingsFromPluginData,
	getRetentionWorkloadWarning,
	mergeSettingsIntoPluginData,
	normalizeMaximumInterval,
	normalizeFolder,
	normalizePositiveInteger,
	normalizeRetention,
	normalizeSettings,
} from "./models/settings";

export type { MnemeSettings } from "./models/settings";

export interface MnemeSettingsHost extends Plugin {
	settings: MnemeSettings;
	saveSettings(): Promise<void>;
	refreshReviewViews?(): Promise<void>;
	updateFsrsSchedulerConfig?(): void;
}

export class MnemeSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: MnemeSettingsHost) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Mneme" });
		containerEl.createEl("h3", { text: "Markdown Writing" });

		new Setting(containerEl)
			.setName("Concepts folder")
			.setDesc("Approved concept proposals are written here.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.conceptsFolder);
				text.setValue(this.plugin.settings.conceptsFolder);
				text.onChange(async (value) => {
					this.plugin.settings.conceptsFolder = normalizeFolder(value, DEFAULT_SETTINGS.conceptsFolder);
					text.setValue(this.plugin.settings.conceptsFolder);
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("Cards folder")
			.setDesc("Approved card proposals are written here.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.cardsFolder);
				text.setValue(this.plugin.settings.cardsFolder);
				text.onChange(async (value) => {
					this.plugin.settings.cardsFolder = normalizeFolder(value, DEFAULT_SETTINGS.cardsFolder);
					text.setValue(this.plugin.settings.cardsFolder);
					await this.persistSettings();
				});
			});

		containerEl.createEl("h3", { text: "Scheduled Review" });

		new Setting(containerEl)
			.setName("Show Today’s Focus")
			.setDesc("When off, Mneme hides the scheduled due-card queue. Manual Concept Review from Concept Library still updates Card memory with FSRS.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.fsrsEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.fsrsEnabled = value;
					await this.persistSettings();
					await this.plugin.refreshReviewViews?.();
				});
			});

		const retentionSetting = new Setting(containerEl)
			.setName("Request retention")
			.setDesc(formatRetentionDescription(this.plugin.settings.fsrsRequestRetention));
		retentionSetting.addText((text) => {
			text.inputEl.type = "number";
			text.inputEl.min = "0.70";
			text.inputEl.max = "0.98";
			text.inputEl.step = "0.01";
			text.setValue(formatRetention(this.plugin.settings.fsrsRequestRetention));
			text.onChange(async (value) => {
				this.plugin.settings.fsrsRequestRetention = normalizeRetention(Number(value));
				text.setValue(formatRetention(this.plugin.settings.fsrsRequestRetention));
				retentionSetting.setDesc(formatRetentionDescription(this.plugin.settings.fsrsRequestRetention));
				await this.persistSettings();
			});
		});

		new Setting(containerEl)
			.setName("Enable fuzz")
			.setDesc("Adds small randomness to longer intervals to avoid review clustering.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.fsrsEnableFuzz);
				toggle.onChange(async (value) => {
					this.plugin.settings.fsrsEnableFuzz = value;
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("Maximum interval")
			.setDesc("Caps how far into the future a card can be scheduled.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.step = "1";
				text.setValue(String(this.plugin.settings.fsrsMaximumInterval));
				text.onChange(async (value) => {
					this.plugin.settings.fsrsMaximumInterval = normalizeMaximumInterval(Number(value));
					text.setValue(String(this.plugin.settings.fsrsMaximumInterval));
					await this.persistSettings();
				});
			});

		containerEl.createEl("h3", { text: "AI Capture" });

		new Setting(containerEl)
			.setName("Enable AI capture")
			.setDesc("Generate Concept proposals from Analyze Current Note.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.aiCaptureEnabled);
				toggle.onChange(async (value) => {
					this.plugin.settings.aiCaptureEnabled = value;
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Selects the provider used for Concept proposals.")
			.addDropdown((dropdown) => {
				dropdown.addOption("mock", "Mock");
				dropdown.addOption("openai", "OpenAI");
				dropdown.addOption("deepseek", "DeepSeek");
				dropdown.setValue(this.plugin.settings.aiProvider);
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiProvider = value === "deepseek" || value === "openai" ? value : "mock";
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Stored locally in Obsidian plugin data. Mneme does not log this value.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-...");
				text.setValue(this.plugin.settings.openaiApiKey);
				text.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value.trim();
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("OpenAI base URL")
			.setDesc("Use the default OpenAI API URL unless you have a compatible endpoint.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.openaiBaseUrl);
				text.setValue(this.plugin.settings.openaiBaseUrl);
				text.onChange(async (value) => {
					this.plugin.settings.openaiBaseUrl = value.trim().replace(/\/+$/g, "") || DEFAULT_SETTINGS.openaiBaseUrl;
					text.setValue(this.plugin.settings.openaiBaseUrl);
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Model used by the OpenAI provider.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.openaiModel);
				text.setValue(this.plugin.settings.openaiModel);
				text.onChange(async (value) => {
					this.plugin.settings.openaiModel = value.trim() || DEFAULT_SETTINGS.openaiModel;
					text.setValue(this.plugin.settings.openaiModel);
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("DeepSeek API key")
			.setDesc("Stored locally in Obsidian plugin data. Mneme does not log this value.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("DeepSeek API key");
				text.setValue(this.plugin.settings.deepseekApiKey);
				text.onChange(async (value) => {
					this.plugin.settings.deepseekApiKey = value.trim();
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("DeepSeek base URL")
			.setDesc("OpenAI-compatible DeepSeek API endpoint.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.deepseekBaseUrl);
				text.setValue(this.plugin.settings.deepseekBaseUrl);
				text.onChange(async (value) => {
					this.plugin.settings.deepseekBaseUrl = value.trim().replace(/\/+$/g, "") || DEFAULT_SETTINGS.deepseekBaseUrl;
					text.setValue(this.plugin.settings.deepseekBaseUrl);
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("DeepSeek model")
			.setDesc("Model used by the DeepSeek provider.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.deepseekModel);
				text.setValue(this.plugin.settings.deepseekModel);
				text.onChange(async (value) => {
					this.plugin.settings.deepseekModel = value.trim() || DEFAULT_SETTINGS.deepseekModel;
					text.setValue(this.plugin.settings.deepseekModel);
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("Request timeout")
			.setDesc("Maximum provider wait time in milliseconds. Larger notes and structured JSON output may need 120000 ms or more.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.step = "1000";
				text.setValue(String(this.plugin.settings.aiRequestTimeoutMs));
				text.onChange(async (value) => {
					this.plugin.settings.aiRequestTimeoutMs = normalizePositiveInteger(Number(value), DEFAULT_SETTINGS.aiRequestTimeoutMs);
					text.setValue(String(this.plugin.settings.aiRequestTimeoutMs));
					await this.persistSettings();
				});
			});

		new Setting(containerEl)
			.setName("AI chunk size")
			.setDesc("Maximum characters per AI request. Longer Source Notes are analyzed completely across multiple Markdown-aware chunks.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.step = "1000";
				text.setValue(String(this.plugin.settings.aiMaxInputChars));
				text.onChange(async (value) => {
					this.plugin.settings.aiMaxInputChars = normalizePositiveInteger(Number(value), DEFAULT_SETTINGS.aiMaxInputChars);
					text.setValue(String(this.plugin.settings.aiMaxInputChars));
					await this.persistSettings();
				});
			});

		containerEl.createEl("h3", { text: "Developer Tools" });

		new Setting(containerEl)
			.setName("Enable developer tools")
			.setDesc("Shows acceptance fixtures, debug commands, and diagnostic logging commands. Reload Mneme after changing this setting to update command palette visibility.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enableDeveloperTools);
				toggle.onChange(async (value) => {
					this.plugin.settings.enableDeveloperTools = value;
					await this.persistSettings();
				});
			});
	}

	private async persistSettings(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.updateFsrsSchedulerConfig?.();
	}

}

function formatRetention(value: number): string {
	return value.toFixed(2);
}

function formatRetentionDescription(retention: number): string {
	return `Global FSRS policy used unless a Concept has an explicit override. Higher retention means shorter intervals and more reviews. ${getRetentionWorkloadWarning(retention)} Importance does not change retention.`;
}
