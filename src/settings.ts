import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { CARD_DRAFT_TYPES, type CardDraftType } from "./models/knowledgeProposal";
import {
	DEFAULT_SETTINGS,
	getRetentionWorkloadWarning,
	MnemeSettings,
	normalizeFolder,
	normalizeMaximumInterval,
	normalizePositiveInteger,
	normalizeRetention,
} from "./models/settings";
import { CARD_TYPE_DESCRIPTIONS, CARD_TYPE_LABELS } from "./services/cardTypeDisplay";

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
			.setName("Suggest English aliases")
			.setDesc("When enabled, Mneme may suggest an optional English alias for non-English Concept titles. Aliases never control Concept or Card identity.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.suggestEnglishAliases);
				toggle.onChange(async (value) => {
					this.plugin.settings.suggestEnglishAliases = value;
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
					this.display();
				});
			});

		this.renderSelectedProviderSettings(containerEl);
		this.renderAiRequestOptions(containerEl);

		containerEl.createEl("h3", { text: "Card Generation" });

		this.renderAllowedCardTypes(containerEl);

		containerEl.createEl("h3", { text: "Developer Tools" });

		new Setting(containerEl)
			.setName("Show advanced diagnostics")
			.setDesc("Shows Card scheduling, repair, archive, and deletion diagnostics at the bottom of Mneme Review. Keep this off for ordinary review.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.showAdvancedDiagnostics);
				toggle.onChange(async (value) => {
					this.plugin.settings.showAdvancedDiagnostics = value;
					await this.persistSettings();
					await this.plugin.refreshReviewViews?.();
				});
			});

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

	private renderSelectedProviderSettings(containerEl: HTMLElement): void {
		if (this.plugin.settings.aiProvider === "mock") {
			new Setting(containerEl)
				.setName("Mock provider")
				.setDesc("Uses deterministic offline proposals for testing. No API key or network request is required.");
			return;
		}

		if (this.plugin.settings.aiProvider === "openai") {
			this.renderOpenAiSettings(containerEl);
			return;
		}

		this.renderDeepSeekSettings(containerEl);
	}

	private renderOpenAiSettings(containerEl: HTMLElement): void {
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
	}

	private renderDeepSeekSettings(containerEl: HTMLElement): void {
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
	}

	private renderAiRequestOptions(containerEl: HTMLElement): void {
		const detailsEl = containerEl.createEl("details", { cls: "mneme-settings-details" });
		detailsEl.createEl("summary", {
			text: `Request options · ${this.plugin.settings.aiRequestTimeoutMs} ms · ${this.plugin.settings.aiMaxInputChars} chars`,
		});

		new Setting(detailsEl)
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

		new Setting(detailsEl)
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
	}

	private renderAllowedCardTypes(containerEl: HTMLElement): void {
		const enabledCount = this.plugin.settings.allowedAiCardTypes.length;
		const detailsEl = containerEl.createEl("details", { cls: "mneme-settings-details" });
		const summaryEl = detailsEl.createEl("summary", {
			text: `Allowed AI card types · ${enabledCount}/${CARD_DRAFT_TYPES.length} enabled`,
		});
		detailsEl.createEl("p", {
			cls: "setting-item-description",
			text: "Choose which built-in Card types AI may use. Enabled types are allowed options, not required quotas; AI should skip unsuitable types instead of forcing them.",
		});

		for (const cardType of CARD_DRAFT_TYPES) {
			new Setting(detailsEl)
				.setName(CARD_TYPE_LABELS[cardType])
				.setDesc(CARD_TYPE_DESCRIPTIONS[cardType])
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.allowedAiCardTypes.includes(cardType));
					toggle.onChange(async (value) => {
						const nextTypes = toggleAllowedCardType(this.plugin.settings.allowedAiCardTypes, cardType, value);
						if (nextTypes.length === 0) {
							toggle.setValue(true);
							new Notice("Mneme: At least one Card type must stay enabled.");
							return;
						}
						this.plugin.settings.allowedAiCardTypes = nextTypes;
						await this.persistSettings();
						summaryEl.setText(`Allowed AI card types · ${nextTypes.length}/${CARD_DRAFT_TYPES.length} enabled`);
					});
				});
		}
	}

	private async persistSettings(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.updateFsrsSchedulerConfig?.();
	}

}

function toggleAllowedCardType(
	currentTypes: readonly CardDraftType[],
	cardType: CardDraftType,
	enabled: boolean,
): CardDraftType[] {
	const current = new Set(currentTypes);

	if (enabled) {
		current.add(cardType);
	} else {
		current.delete(cardType);
	}

	return CARD_DRAFT_TYPES.filter((type) => current.has(type));
}

function formatRetention(value: number): string {
	return value.toFixed(2);
}

function formatRetentionDescription(retention: number): string {
	return `Global FSRS policy used unless a Concept has an explicit override. Higher retention means shorter intervals and more reviews. ${getRetentionWorkloadWarning(retention)} Importance does not change retention.`;
}
