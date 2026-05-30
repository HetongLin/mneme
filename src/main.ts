import { Notice, Plugin, TFile } from "obsidian";
import type { KnowledgeProposal } from "./models/knowledgeProposal";
import { ConfirmClearReviewHistoryModal } from "./modals/confirmClearReviewHistoryModal";
import {
	DEFAULT_SETTINGS,
	getSettingsFromPluginData,
	mergeSettingsIntoPluginData,
	MnemeSettings,
	MnemeSettingTab,
} from "./settings";
import { CardFileLoader } from "./services/cardFileLoader";
import { FsrsReviewScheduler, FsrsSchedulerConfig } from "./services/fsrsReviewScheduler";
import { ApprovedProposalWriter } from "./services/approvedProposalWriter";
import { KnowledgeProposalStore } from "./services/knowledgeProposalStore";
import { ObsidianVaultAdapter } from "./services/obsidianVaultAdapter";
import { ReviewStateStore } from "./services/reviewStateStore";
import { SourceAnalysisService } from "./services/sourceAnalysisService";
import { SourceAnalysisStore } from "./services/sourceAnalysisStore";
import { MnemeInboxView, INBOX_VIEW_TYPE } from "./views/inboxView";
import { MnemeReviewView, REVIEW_VIEW_TYPE } from "./views/reviewView";

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;
	private reviewScheduler: FsrsReviewScheduler;
	reviewStateStore: ReviewStateStore;
	private sourceAnalysisStore: SourceAnalysisStore;
	private knowledgeProposalStore: KnowledgeProposalStore;
	private approvedProposalWriter: ApprovedProposalWriter;

	async onload() {
		await this.loadSettings();
		this.reviewScheduler = new FsrsReviewScheduler(settingsToFsrsConfig(this.settings));
		this.reviewStateStore = new ReviewStateStore(this, this.reviewScheduler);
		this.sourceAnalysisStore = new SourceAnalysisStore(this);
		this.knowledgeProposalStore = new KnowledgeProposalStore(this);
		this.approvedProposalWriter = new ApprovedProposalWriter({
			proposalStore: this.knowledgeProposalStore,
			settingsProvider: () => this.settings,
			vaultAdapter: new ObsidianVaultAdapter(this.app.vault),
		});
		await this.reviewStateStore.load();

		this.addSettingTab(new MnemeSettingTab(this.app, this));
		this.registerView(REVIEW_VIEW_TYPE, (leaf) => new MnemeReviewView(leaf, this.reviewStateStore));
		this.registerView(INBOX_VIEW_TYPE, (leaf) => new MnemeInboxView(
			leaf,
			this.knowledgeProposalStore,
			this.approvedProposalWriter,
		));

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

		this.addCommand({
			id: "mneme-clear-review-history",
			name: "Mneme: Clear Review History",
			callback: () => this.openClearReviewHistoryModal(),
		});

		this.addCommand({
			id: "mneme-analyze-current-note",
			name: "Mneme: Analyze Current Note",
			callback: () => {
				void this.analyzeCurrentNote();
			},
		});

		this.addCommand({
			id: "mneme-log-source-analysis-state",
			name: "Mneme: Log Source Analysis State",
			callback: () => {
				void this.logSourceAnalysisState();
			},
		});

		this.addCommand({
			id: "mneme-open-inbox",
			name: "Mneme: Open Inbox",
			callback: () => {
				void this.openInboxView();
			},
		});

		this.addCommand({
			id: "mneme-log-knowledge-proposals",
			name: "Mneme: Log Knowledge Proposals",
			callback: () => {
				void this.logKnowledgeProposals();
			},
		});

		this.addCommand({
			id: "mneme-add-sample-knowledge-proposal",
			name: "Mneme: Add Sample Knowledge Proposal",
			callback: () => {
				void this.addSampleKnowledgeProposal();
			},
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = {
			...DEFAULT_SETTINGS,
			...getSettingsFromPluginData(await this.loadData()),
		};
	}

	async saveSettings() {
		await this.saveData(mergeSettingsIntoPluginData(await this.loadData(), this.settings));
		this.reviewStateStore?.setSettings(this.settings);
	}

	updateFsrsSchedulerConfig(): void {
		this.reviewScheduler?.updateConfig(settingsToFsrsConfig(this.settings));
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

	private async analyzeCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No active note to analyze.");
			return;
		}

		if (activeFile.extension !== "md") {
			new Notice("Active file is not a Markdown note.");
			return;
		}

		const service = new SourceAnalysisService(
			this.sourceAnalysisStore,
			(sourcePath) => this.readSourceNote(sourcePath),
		);

		const result = await service.analyzeSource({
			mtime: activeFile.stat.mtime,
			path: activeFile.path,
			size: activeFile.stat.size,
		});

		if (result.status === "failed") {
			console.error("Mneme: source analysis failed", result);
			new Notice("Mneme: Source analysis failed. See console.");
			return;
		}

		console.info("Mneme: source analysis result", result);
		new Notice(getSourceAnalysisNotice(result.status));
	}

	private async readSourceNote(sourcePath: string): Promise<string> {
		const abstractFile = this.app.vault.getAbstractFileByPath(sourcePath);

		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Source note not found: ${sourcePath}`);
		}

		return this.app.vault.cachedRead(abstractFile);
	}

	private async logSourceAnalysisState(): Promise<void> {
		try {
			const records = await this.sourceAnalysisStore.listRecords();

			console.info("Mneme: source analysis state", records);
			new Notice(`Mneme: Logged source analysis state for ${records.length} source notes.`);
		} catch (error) {
			console.error("Mneme: failed to log source analysis state", error);
			new Notice("Mneme: failed to log source analysis state. See console.");
		}
	}

	private async logKnowledgeProposals(): Promise<void> {
		try {
			const proposals = await this.knowledgeProposalStore.listProposals();

			console.info("Mneme: knowledge proposals", proposals);
			new Notice(`Mneme: Logged ${proposals.length} knowledge proposals.`);
		} catch (error) {
			console.error("Mneme: failed to log knowledge proposals", error);
			new Notice("Mneme: failed to log knowledge proposals. See console.");
		}
	}

	private async addSampleKnowledgeProposal(): Promise<void> {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			const sourcePath = activeFile?.extension === "md" ? activeFile.path : undefined;
			const sourceRecord = sourcePath ? await this.sourceAnalysisStore.getRecord(sourcePath) : undefined;
			const now = new Date().toISOString();
			const title = activeFile?.extension === "md"
				? `Sample Concept from ${activeFile.basename}`
				: "Sample Concept";
			// Temporary debug seed for Inbox validation. It does not call AI or write Markdown.
			const proposal: KnowledgeProposal = {
				createdAt: now,
				id: `sample-${Date.now()}`,
				kind: "new_concept",
				payload: {
					coreMeaning: "Describe the core idea before approving this proposal.",
					proposedCards: [{
						back: "Replace this with the answer before approval.",
						front: "What should this concept help you remember?",
						rubric: "Mention the important distinctions and examples.",
					}],
					summary: "A temporary sample proposal for Inbox validation.",
					title,
				},
				sourceHash: sourceRecord?.contentHash,
				sourcePath,
				status: "suggested",
				updatedAt: now,
			};

			await this.knowledgeProposalStore.upsertProposal(proposal);
			console.info("Mneme: sample knowledge proposal added", proposal);
			new Notice("Mneme: Sample proposal added.");
			await this.refreshOpenInboxViews();
		} catch (error) {
			console.error("Mneme: failed to add sample knowledge proposal", error);
			new Notice("Mneme: failed to add sample proposal. See console.");
		}
	}

	private logReviewState(): void {
		const reviewStates = this.reviewStateStore.getAllStates();
		const stateCount = this.reviewStateStore.getReviewStateCount();

		console.info("Mneme: stored review state", reviewStates);
		new Notice(`Mneme: ${stateCount} stored card states.`);
	}

	private openClearReviewHistoryModal(): void {
		new ConfirmClearReviewHistoryModal(this.app, {
			onConfirm: () => this.clearReviewHistory(),
		}).open();
	}

	private async clearReviewHistory(): Promise<void> {
		const previousCount = this.reviewStateStore.getReviewStateCount();

		try {
			await this.reviewStateStore.clearReviewStates();
			console.info("Mneme: review history cleared", {
				previousCount,
			});
			new Notice("Mneme review history cleared.");
			await this.refreshOpenReviewViews();
		} catch (error) {
			console.error("Mneme: failed to clear review history", error);
			new Notice("Mneme: failed to clear review history. See console for details.");
		}
	}

	private async refreshOpenReviewViews(): Promise<void> {
		const refreshes = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)
			.map((leaf) => leaf.view)
			.filter((view): view is MnemeReviewView => view instanceof MnemeReviewView)
			.map((view) => view.refreshCards());

		await Promise.all(refreshes);
	}

	private async refreshOpenInboxViews(): Promise<void> {
		const refreshes = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)
			.map((leaf) => leaf.view)
			.filter((view): view is MnemeInboxView => view instanceof MnemeInboxView)
			.map((view) => view.refresh());

		await Promise.all(refreshes);
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

	private async openInboxView(): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0];

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Mneme: could not open Inbox.");
			return;
		}

		await leaf.setViewState({
			active: true,
			type: INBOX_VIEW_TYPE,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}

function settingsToFsrsConfig(settings: MnemeSettings): FsrsSchedulerConfig {
	return {
		enableFuzz: settings.fsrsEnableFuzz,
		maximumInterval: settings.fsrsMaximumInterval,
		requestRetention: settings.fsrsRequestRetention,
	};
}

function getSourceAnalysisNotice(status: string): string {
	switch (status) {
		case "analyzed":
			return "Mneme: Source note indexed.";
		case "skipped_metadata_unchanged":
			return "Mneme: No changes since last analysis.";
		case "skipped_hash_unchanged":
			return "Mneme: Content hash unchanged.";
		default:
			return "Mneme: Source analysis updated.";
	}
}
