import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MnemeSettings } from "./settings";
import { CardFileLoader } from "./services/cardFileLoader";
import { ReviewStateStore } from "./services/reviewStateStore";
import { MnemeReviewView, REVIEW_VIEW_TYPE } from "./views/reviewView";

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;
	reviewStateStore: ReviewStateStore;

	async onload() {
		await this.loadSettings();
		this.reviewStateStore = new ReviewStateStore(this);
		await this.reviewStateStore.load();

		this.registerView(REVIEW_VIEW_TYPE, (leaf) => new MnemeReviewView(leaf, this.reviewStateStore));

		this.addCommand({
			id: "open-review-view",
			name: "Mneme: Open Review View",
			callback: () => {
				void this.openReviewView();
			},
		});

		this.addCommand({
			id: "scan-card-files",
			name: "Mneme: Scan Card Files",
			callback: () => {
				void this.scanCardFiles();
			},
		});

		this.addCommand({
			id: "mneme-log-review-state",
			name: "Mneme: Log Review State",
			callback: () => this.logReviewState(),
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

	private logReviewState(): void {
		const reviewStates = this.reviewStateStore.getAllStates();
		const stateCount = Object.keys(reviewStates).length;

		console.info("Mneme: stored review state", reviewStates);
		new Notice(`Mneme: ${stateCount} stored card states.`);
	}

	private async openReviewView() {
		const existingLeaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Mneme: could not open Review View.");
			return;
		}

		await leaf.setViewState({
			active: true,
			type: REVIEW_VIEW_TYPE,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}
