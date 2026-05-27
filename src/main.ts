import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MnemeSettings } from "./settings";
import { CardFileLoader } from "./services/cardFileLoader";

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "scan-card-files",
			name: "Mneme: Scan Card Files",
			callback: () => {
				void this.scanCardFiles();
			},
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MnemeSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async scanCardFiles() {
		try {
			const loader = new CardFileLoader(this.app);
			const cards = await loader.loadCardFiles();
			const validCount = cards.filter((card) => card.isValid).length;
			const invalidCount = cards.length - validCount;

			console.info("Mneme: scanned Card.md files", {
				cards,
				invalidCount,
				totalCount: cards.length,
				validCount,
			});

			new Notice(`Mneme: scanned ${cards.length} card files, ${validCount} valid, ${invalidCount} invalid.`);
		} catch (error) {
			console.error("Mneme: card file scan failed", error);
			new Notice("Mneme: card file scan failed. See console for details.");
		}
	}
}
