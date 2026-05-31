import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	DEFAULT_SETTINGS,
	MnemeSettings,
	normalizeFolder,
	normalizeMaximumInterval,
	normalizeRetention,
} from "./models/settings";

export {
	DEFAULT_SETTINGS,
	getSettingsFromPluginData,
	mergeSettingsIntoPluginData,
	normalizeMaximumInterval,
	normalizeFolder,
	normalizeRetention,
	normalizeSettings,
} from "./models/settings";

export type { MnemeSettings } from "./models/settings";

export interface MnemeSettingsHost extends Plugin {
	settings: MnemeSettings;
	saveSettings(): Promise<void>;
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

		containerEl.createEl("h3", { text: "FSRS Scheduling" });

		new Setting(containerEl)
			.setName("Request retention")
			.setDesc("Higher retention means shorter intervals and more reviews.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0.70";
				text.inputEl.max = "0.98";
				text.inputEl.step = "0.01";
				text.setValue(formatRetention(this.plugin.settings.fsrsRequestRetention));
				text.onChange(async (value) => {
					this.plugin.settings.fsrsRequestRetention = normalizeRetention(Number(value));
					text.setValue(formatRetention(this.plugin.settings.fsrsRequestRetention));
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
