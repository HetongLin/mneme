import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MnemeSettings } from "./settings";

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;

	async onload() {
		await this.loadSettings();
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MnemeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
