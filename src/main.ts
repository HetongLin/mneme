import { Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import {
	ACCEPTANCE_CARD_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_ID,
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_TITLE,
	ACCEPTANCE_SOURCE_PATH,
} from "./acceptance/preAiAcceptanceFixture";
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
import { AiCardGenerationService } from "./services/aiCardGenerationService";
import { AiConceptCaptureService } from "./services/aiConceptCaptureService";
import { AiGenerationLock } from "./services/aiGenerationLock";
import { exportCardsToAnkiTsv } from "./services/ankiTsvExporter";
import { createAiProvider } from "./services/aiProviderFactory";
import { ConceptSourceLinkStore } from "./services/conceptSourceLinkStore";
import {
	canAnalyzeCurrentNote,
	canGenerateCardsFromCurrentConcept,
	canOpenCardsForCurrentConcept,
	classifyCurrentNote,
	type CurrentNoteKind,
} from "./services/currentNoteActionPolicy";
import { ConceptScanner } from "./services/conceptScanner";
import { ConceptLoader } from "./services/conceptLoader";
import { ConceptMergeService } from "./services/conceptMergeService";
import {
	getCardGroupLinkFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
} from "./services/conceptMarkdownIdentity";
import { parseConceptTitle } from "./services/conceptMarkdownParser";
import { KnowledgeProposalStore } from "./services/knowledgeProposalStore";
import { createKnowledgeContextPack } from "./services/knowledgeContextPackExporter";
import { ManualConceptDraftStore } from "./services/manualConceptDraftStore";
import { ManualConceptProvenanceCommitter, type ManualConceptSourceSnapshot } from "./services/manualConceptProvenanceService";
import { ObsidianConceptVaultAdapter } from "./services/obsidianConceptVaultAdapter";
import { ObsidianAiHttpClient } from "./services/obsidianAiHttpClient";
import { ObsidianVaultAdapter } from "./services/obsidianVaultAdapter";
import { PreAiAcceptanceFixtureService } from "./services/preAiAcceptanceFixtureService";
import { createManualConcept, type ManualConceptInput, type ManualConceptResult } from "./services/manualConceptService";
import { ReviewStateStore } from "./services/reviewStateStore";
import { SourceAnalysisService } from "./services/sourceAnalysisService";
import { SourceAnalysisStore } from "./services/sourceAnalysisStore";
import { SourceProvenanceRelinkService } from "./services/sourceProvenanceRelinkService";
import { SourceProvenanceRemovalService } from "./services/sourceProvenanceRemovalService";
import { VaultStateReconciler } from "./services/vaultStateReconciler";
import { buildCardGroupPath, buildConceptPath, normalizeVaultPath } from "./utils/markdownPath";
import { computeContentHash } from "./utils/sourceHash";
import { CONCEPT_COMPOSER_VIEW_TYPE, MnemeConceptComposerView } from "./views/conceptComposerView";
import { CONCEPT_LIBRARY_VIEW_TYPE, MnemeConceptLibraryView } from "./views/conceptLibraryView";
import { MnemeInboxView, INBOX_VIEW_TYPE, type InboxTab } from "./views/inboxView";
import { MnemeReviewView, REVIEW_VIEW_TYPE } from "./views/reviewView";

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;
	private reviewScheduler: FsrsReviewScheduler;
	reviewStateStore: ReviewStateStore;
	private sourceAnalysisStore: SourceAnalysisStore;
	private knowledgeProposalStore: KnowledgeProposalStore;
	private conceptSourceLinkStore: ConceptSourceLinkStore;
	private manualConceptDraftStore: ManualConceptDraftStore;
	private approvedProposalWriter: ApprovedProposalWriter;
	private readonly aiGenerationLock = new AiGenerationLock();

	async onload() {
		await this.loadSettings();
		this.reviewScheduler = new FsrsReviewScheduler(settingsToFsrsConfig(this.settings));
		this.reviewStateStore = new ReviewStateStore(this, this.reviewScheduler);
		this.sourceAnalysisStore = new SourceAnalysisStore(this);
		this.knowledgeProposalStore = new KnowledgeProposalStore(this);
		this.conceptSourceLinkStore = new ConceptSourceLinkStore(this);
		this.manualConceptDraftStore = new ManualConceptDraftStore(this);
		this.approvedProposalWriter = new ApprovedProposalWriter({
			conceptSourceLinkStore: this.conceptSourceLinkStore,
			conceptScanner: this.createConceptScanner(),
			isConceptIdReserved: async (conceptId) => {
				if (this.reviewStateStore.getConceptMergeRecords()[conceptId]) {
					return true;
				}

				const result = await this.createConceptScanner().scan();

				return result.concepts.some((concept) => concept.conceptId === conceptId)
					|| result.identityIssues.some((issue) => issue.conceptId === conceptId);
			},
			proposalStore: this.knowledgeProposalStore,
			settingsProvider: () => this.settings,
			sourceAnalysisStore: this.sourceAnalysisStore,
			vaultAdapter: new ObsidianVaultAdapter(this.app.vault),
		});
		await this.reviewStateStore.load();

		this.addSettingTab(new MnemeSettingTab(this.app, this));
		this.registerView(REVIEW_VIEW_TYPE, (leaf) => new MnemeReviewView(
			leaf,
			this.reviewStateStore,
			() => this.settings,
		));
		this.registerView(INBOX_VIEW_TYPE, (leaf) => new MnemeInboxView(
			leaf,
			this.knowledgeProposalStore,
			this.approvedProposalWriter,
			this.createVaultStateReconciler(),
		));
		this.registerView(CONCEPT_LIBRARY_VIEW_TYPE, (leaf) => new MnemeConceptLibraryView(
			leaf,
			this.createConceptScanner(),
			this.reviewStateStore,
			{
				conceptMergeService: new ConceptMergeService(
					new ObsidianVaultAdapter(this.app.vault),
					this,
				),
				createConcept: () => this.openConceptComposerView(),
				sourceRelinkService: new SourceProvenanceRelinkService(
					new ObsidianVaultAdapter(this.app.vault),
					this,
				),
				sourceRemovalService: new SourceProvenanceRemovalService(
					new ObsidianVaultAdapter(this.app.vault),
					this,
				),
				generateCards: (concept) => this.generateCardsFromConceptPath(concept.path),
			},
		));
		this.registerView(CONCEPT_COMPOSER_VIEW_TYPE, (leaf) => new MnemeConceptComposerView(leaf, {
			create: (input) => this.createManualConceptFromComposer(input),
			draftStore: this.manualConceptDraftStore,
			getCurrentSourcePath: () => this.getCurrentManualConceptSourcePath(),
			listSourcePaths: () => this.listManualConceptSourcePaths(),
			onCreated: () => this.refreshOpenConceptLibraryViews(),
			openConcept: (path) => this.openConceptInTab(path),
			scanConcepts: () => this.createConceptScanner().scanConcepts(),
		}));

		this.registerProductCommands();
		if (this.settings.enableDeveloperTools) {
			this.registerDeveloperCommands();
		}
	}

	onunload() {
	}

	private registerProductCommands(): void {
		this.addCommand({
			id: "open-review-view",
			name: "Open Review View",
			callback: () => {
				void this.openReviewView();
			},
		});

		this.addCommand({
			id: "mneme-clear-review-history",
			name: "Clear Review History",
			callback: () => this.openClearReviewHistoryModal(),
		});

		this.addCommand({
			id: "mneme-create-concept",
			name: "Create Concept",
			callback: () => {
				void this.openConceptComposerView();
			},
		});

		this.addCommand({
			id: "mneme-analyze-current-note",
			name: "Analyze Current Note",
			checkCallback: (checking) => {
				const available = canAnalyzeCurrentNote(this.getCurrentNoteKind());
				if (!checking && available) void this.analyzeCurrentNote();
				return available;
			},
		});

		this.addCommand({
			id: "mneme-generate-cards-from-current-concept",
			name: "Generate Cards from Current Concept",
			checkCallback: (checking) => {
				const available = canGenerateCardsFromCurrentConcept(this.getCurrentNoteKind());
				if (!checking && available) void this.generateCardsFromCurrentConcept();
				return available;
			},
		});

		this.addCommand({
			id: "mneme-open-cards-for-current-concept",
			name: "Open Cards for Current Concept",
			checkCallback: (checking) => {
				const available = canOpenCardsForCurrentConcept(this.getCurrentNoteKind());
				if (!checking && available) void this.openCardsForCurrentConcept();
				return available;
			},
		});

		this.addCommand({
			id: "mneme-open-inbox",
			name: "Open Inbox",
			callback: () => {
				void this.openInboxView();
			},
		});

		this.addCommand({
			id: "mneme-open-concept-library",
			name: "Open Concept Library",
			callback: () => {
				void this.openConceptLibraryView();
			},
		});

		this.addCommand({
			id: "mneme-resync-index",
			name: "Resync Index",
			callback: () => {
				void this.resyncMnemeIndex();
			},
		});

		this.addCommand({
			id: "mneme-export-knowledge-context-pack",
			name: "Export Knowledge Context Pack",
			callback: () => {
				void this.exportKnowledgeContextPack();
			},
		});

		this.addCommand({
			id: "mneme-export-anki-tsv",
			name: "Export Anki TSV",
			callback: () => {
				void this.exportAnkiTsv();
			},
		});
	}

	private registerDeveloperCommands(): void {
		this.addCommand({
			id: "scan-card-files",
			name: "Scan Card Files",
			callback: () => {
				void this.scanCardFiles();
			},
		});

		this.addCommand({
			id: "mneme-log-review-state",
			name: "Log Review State",
			callback: () => this.logReviewState(),
		});

		this.addCommand({
			id: "mneme-log-source-analysis-state",
			name: "Log Source Analysis State",
			callback: () => {
				void this.logSourceAnalysisState();
			},
		});

		this.addCommand({
			id: "mneme-log-knowledge-proposals",
			name: "Log Knowledge Proposals",
			callback: () => {
				void this.logKnowledgeProposals();
			},
		});

		this.addCommand({
			id: "mneme-log-concept-source-links",
			name: "Log Concept-Source Links",
			callback: () => {
				void this.logConceptSourceLinks();
			},
		});

		this.addCommand({
			id: "mneme-log-concept-library",
			name: "Log Concept Library",
			callback: () => {
				void this.logConceptLibrary();
			},
		});

		this.addCommand({
			id: "mneme-add-sample-knowledge-proposal",
			name: "Add Sample Knowledge Proposal",
			callback: () => {
				void this.addSampleKnowledgeProposal();
			},
		});

		this.addCommand({
			id: "mneme-create-pre-ai-acceptance-fixture",
			name: "Create Pre-AI Acceptance Fixture",
			callback: () => {
				void this.createPreAiAcceptanceFixture();
			},
		});

		this.addCommand({
			id: "mneme-log-pre-ai-acceptance-fixture",
			name: "Log Pre-AI Acceptance Fixture",
			callback: () => {
				void this.logPreAiAcceptanceFixture();
			},
		});

		this.addCommand({
			id: "mneme-generate-pre-ai-acceptance-cards",
			name: "Generate Pre-AI Acceptance Cards",
			callback: () => {
				void this.generatePreAiAcceptanceCards();
			},
		});
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

			console.info("Mneme: scanned Card Markdown files", {
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
		const noteKind = this.getCurrentNoteKind();

		if (noteKind === "none" || !activeFile) {
			new Notice("No active note to analyze.");
			return;
		}

		if (noteKind === "non_markdown") {
			new Notice("Active file is not a Markdown note.");
			return;
		}

		if (noteKind === "reviewable_concept" || noteKind === "exploratory_concept") {
			new Notice("Mneme: Analyze Current Note cannot be used on Mneme Concepts.");
			return;
		}

		if (noteKind === "mneme_internal") {
			new Notice("Mneme: Analyze Current Note cannot be used on Mneme internal files.");
			return;
		}

		const readSourceContent = (sourcePath: string) => this.readSourceNote(sourcePath);
		const sourceAnalysisService = new SourceAnalysisService(
			this.sourceAnalysisStore,
			readSourceContent,
		);
		const service = new AiConceptCaptureService({
			conceptScanner: this.createConceptScanner(),
			createProvider: (settings) => createAiProvider(settings, new ObsidianAiHttpClient()),
			generationLock: this.aiGenerationLock,
			proposalStore: this.knowledgeProposalStore,
			readSourceContent,
			settingsProvider: () => this.settings,
			sourceAnalysisService,
			sourceAnalysisStore: this.sourceAnalysisStore,
		});
		const result = await service.analyze({
			mtime: activeFile.stat.mtime,
			path: activeFile.path,
			size: activeFile.stat.size,
		});

		if (result.status === "failed") {
			console.error("Mneme: source analysis or AI capture failed", {
				message: result.message,
				sourcePath: activeFile.path,
				status: result.status,
			});
			new Notice(`Mneme: AI capture failed: ${formatNoticeDetail(result.message)} No proposals added.`);
			return;
		}

		if (result.status === "invalid_response") {
			console.warn("Mneme: AI response rejected", {
				message: result.message,
				sourcePath: activeFile.path,
			});
			new Notice(`Mneme: AI response invalid: ${formatNoticeDetail(result.message)} No proposals added.`);
			return;
		}

		new Notice(`Mneme: ${result.message}`);

		if (result.status === "captured") {
			await this.openInboxView("concepts");
		}
	}

	private async readSourceNote(sourcePath: string): Promise<string> {
		const abstractFile = this.app.vault.getAbstractFileByPath(sourcePath);

		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Source note not found: ${sourcePath}`);
		}

		return this.app.vault.cachedRead(abstractFile);
	}

	private async generateCardsFromCurrentConcept(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const noteKind = this.getCurrentNoteKind();

		if (noteKind === "exploratory_concept") {
			new Notice("Mneme: Exploratory Concepts do not generate review Cards.");
			return;
		}

		if (!activeFile || !canGenerateCardsFromCurrentConcept(noteKind)) {
			new Notice("Mneme: Open a written Concept before generating Cards.");
			return;
		}

		await this.generateCardsFromConceptFile(activeFile);
	}

	private async generateCardsFromConceptPath(conceptPath: string): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(conceptPath);

		if (!(abstractFile instanceof TFile)) {
			new Notice("Mneme: Concept file not found.");
			return;
		}

		await this.generateCardsFromConceptFile(abstractFile);
	}

	private async openCardsForCurrentConcept(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile || !canOpenCardsForCurrentConcept(this.getCurrentNoteKind())) {
			new Notice("Mneme: Open a written Concept before opening its Cards.");
			return;
		}

		const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		const conceptId = getConceptIdFromFrontmatter(frontmatter);

		if (!conceptId) {
			new Notice("Mneme: Current note is not a Mneme Concept.");
			return;
		}

		const cardsTarget = parseCardsTargetPath(getCardGroupLinkFromConceptFrontmatter(frontmatter))
			?? await this.getDefaultCardFolderForConcept(activeFile);

		await this.openCardTarget(cardsTarget);
	}

	private async getDefaultCardFolderForConcept(conceptFile: TFile): Promise<string> {
		const markdown = await this.app.vault.cachedRead(conceptFile);
		const conceptTitle = parseConceptTitle(markdown, conceptFile.path);

		return buildCardGroupPath(this.settings.cardsFolder, conceptTitle);
	}

	private async openCardTarget(path: string): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (abstractFile instanceof TFile) {
			await this.app.workspace.getLeaf("tab").openFile(abstractFile);
			return;
		}

		if (abstractFile instanceof TFolder) {
			await this.revealInFileExplorer(abstractFile);
			return;
		}

		new Notice("Mneme: Card Group not found. Generate and accept Cards first.");
	}

	private async generateCardsFromConceptFile(conceptFile: TFile): Promise<void> {
		const frontmatter = this.app.metadataCache.getFileCache(conceptFile)?.frontmatter;
		const conceptId = getConceptIdFromFrontmatter(frontmatter);

		if (!conceptId) {
			new Notice("Mneme: Current note is not a Mneme Concept.");
			return;
		}

		if (frontmatter?.learning_mode === "exploratory") {
			new Notice("Mneme: Exploratory Concepts do not generate review Cards.");
			return;
		}

		const markdown = await this.app.vault.cachedRead(conceptFile);
		const conceptTitle = parseConceptTitle(markdown, conceptFile.path);
		const loadedConcepts = await new ConceptLoader(this.app).loadConcepts();
		const existingCardFronts = loadedConcepts.concepts
			.find((concept) => concept.id === conceptId)
			?.cards.filter((card) => card.isValid).map((card) => card.front) ?? [];
		const service = new AiCardGenerationService({
			createProvider: (settings) => createAiProvider(settings, new ObsidianAiHttpClient()),
			generationLock: this.aiGenerationLock,
			proposalStore: this.knowledgeProposalStore,
			settingsProvider: () => this.settings,
			sourceAnalysisStore: this.sourceAnalysisStore,
		});
		const result = await service.generate({
			conceptId,
			conceptMtime: conceptFile.stat.mtime,
			conceptPath: conceptFile.path,
			conceptSize: conceptFile.stat.size,
			conceptTitle,
			existingCardFronts,
			markdown,
		});

		if (result.status === "failed") {
			console.error("Mneme: Card proposal generation failed", {
				conceptPath: conceptFile.path,
				message: result.message,
			});
			new Notice(`Mneme: Card generation failed: ${formatNoticeDetail(result.message)} No Card proposals added.`);
			return;
		}

		if (result.status === "invalid_response") {
			console.warn("Mneme: Card generation response rejected", {
				conceptPath: conceptFile.path,
				message: result.message,
			});
			new Notice(`Mneme: AI response invalid: ${formatNoticeDetail(result.message)} No Card proposals added.`);
			return;
		}

		new Notice(`Mneme: ${result.message}`);

		if (result.status === "generated" || result.status === "skipped_active_proposals") {
			await this.openInboxView("cards");
		}
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

	private async resyncMnemeIndex(): Promise<void> {
		try {
			const result = await this.createVaultStateReconciler().reconcile();
			console.info("Mneme: index resync result", result);
			new Notice(`Mneme: ${result.message}`);
			await this.refreshOpenInboxViews();
		} catch (error) {
			console.error("Mneme: failed to resync index", error);
			new Notice("Mneme: failed to resync index. See console.");
		}
	}

	private async logConceptSourceLinks(): Promise<void> {
		try {
			const links = await this.conceptSourceLinkStore.listLinks();

			console.info("Mneme: concept-source links", links);
			new Notice(`Mneme: Logged concept-source links for ${links.length} links.`);
		} catch (error) {
			console.error("Mneme: failed to log concept-source links", error);
			new Notice("Mneme: failed to log concept-source links. See console.");
		}
	}

	private async logConceptLibrary(): Promise<void> {
		try {
			const concepts = await this.createConceptScanner().scanConcepts();

			console.info("Mneme: concept library", concepts);
			new Notice(`Mneme: Logged ${concepts.length} concepts.`);
		} catch (error) {
			console.error("Mneme: failed to log Concept Library", error);
			new Notice("Mneme: failed to log Concept Library. See console.");
		}
	}

	private async exportKnowledgeContextPack(): Promise<void> {
		try {
			const scanner = this.createConceptScanner();
			const scan = await scanner.scan();

			if (scan.concepts.length === 0) {
				new Notice("Mneme: No approved Concepts to export.");
				return;
			}

			const concepts = await Promise.all(scan.concepts.map(async (summary) => ({
				markdown: await this.readMarkdownFile(summary.path),
				summary,
			})));
			const generatedAt = new Date().toISOString();
			const pack = createKnowledgeContextPack(concepts, { generatedAt });
			const exportFolder = `Mneme/Exports/Knowledge Context Pack ${formatExportTimestamp(generatedAt)}`;

			await this.writeKnowledgeContextPack(exportFolder, pack.files);

			console.info("Mneme: Knowledge Context Pack exported", {
				conceptCount: pack.conceptCount,
				exportFolder,
				files: Object.keys(pack.files),
			});
			new Notice(`Mneme: Exported ${pack.conceptCount} Concepts to ${exportFolder}.`);
		} catch (error) {
			console.error("Mneme: failed to export Knowledge Context Pack", error);
			new Notice("Mneme: Knowledge Context Pack export failed. See console.");
		}
	}

	private async exportAnkiTsv(): Promise<void> {
		try {
			const cards = await new CardFileLoader(this.app).loadCardFiles();
			const retiredCardIds = new Set(Object.keys(this.reviewStateStore.getRetiredCards()));
			const result = exportCardsToAnkiTsv(cards, { retiredCardIds });

			if (result.exportedCardCount === 0) {
				new Notice("Mneme: No active valid Cards to export.");
				return;
			}

			const generatedAt = new Date().toISOString();
			const exportFolder = "Mneme/Exports";
			const exportPath = `${exportFolder}/Anki Export ${formatExportTimestamp(generatedAt)}.tsv`;

			await this.ensureFolderPath(exportFolder);
			await this.app.vault.create(exportPath, result.tsv);

			console.info("Mneme: Anki TSV exported", {
				exportPath,
				exportedCardCount: result.exportedCardCount,
				skippedCardCount: result.skippedCardCount,
			});
			new Notice(`Mneme: Exported ${result.exportedCardCount} Cards to ${exportPath}.`);
		} catch (error) {
			console.error("Mneme: failed to export Anki TSV", error);
			new Notice("Mneme: Anki TSV export failed. See console.");
		}
	}

	private async readMarkdownFile(path: string): Promise<string> {
		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Markdown file not found: ${path}`);
		}

		return this.app.vault.cachedRead(abstractFile);
	}

	private async writeKnowledgeContextPack(baseFolder: string, files: Record<string, string>): Promise<void> {
		await this.ensureFolderPath(baseFolder);

		for (const [relativePath, content] of Object.entries(files)) {
			const fullPath = `${baseFolder}/${relativePath}`;
			const folderPath = fullPath.includes("/") ? fullPath.slice(0, fullPath.lastIndexOf("/")) : "";

			if (folderPath) {
				await this.ensureFolderPath(folderPath);
			}

			await this.app.vault.create(fullPath, content);
		}
	}

	private async ensureFolderPath(path: string): Promise<void> {
		const parts = path.split("/").filter((part) => part.length > 0);
		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);

			if (existing instanceof TFolder) {
				continue;
			}

			if (existing) {
				throw new Error(`Cannot create folder because a file already exists: ${currentPath}`);
			}

			await this.app.vault.createFolder(currentPath);
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
					whyItMatters: "It provides temporary content for validating the Inbox review flow.",
					proposedCards: [{
						back: "Replace this with the answer before approval.",
						front: "What should this concept help you remember?",
						rubric: "Mention the important distinctions and examples.",
					}],
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

	private async createPreAiAcceptanceFixture(): Promise<void> {
		try {
			const service = new PreAiAcceptanceFixtureService({
				conceptScanner: this.createConceptScanner(),
				proposalStore: this.knowledgeProposalStore,
				sourceAnalysisStore: this.sourceAnalysisStore,
				vaultAdapter: new ObsidianVaultAdapter(this.app.vault),
			});
			const result = await service.createFixture();

			console.info("Mneme: pre-AI acceptance fixture created", result);
			new Notice("Mneme: Pre-AI concept fixture created.");
			await this.refreshOpenInboxViews();
		} catch (error) {
			console.error("Mneme: failed to create pre-AI acceptance fixture", error);
			new Notice("Mneme: failed to create pre-AI acceptance fixture. See console.");
		}
	}

	private async generatePreAiAcceptanceCards(): Promise<void> {
		try {
			const service = new PreAiAcceptanceFixtureService({
				conceptScanner: this.createConceptScanner(),
				proposalStore: this.knowledgeProposalStore,
				sourceAnalysisStore: this.sourceAnalysisStore,
				vaultAdapter: new ObsidianVaultAdapter(this.app.vault),
			});
			const result = await service.generateCardProposal();

			console.info("Mneme: pre-AI acceptance card generation result", result);

			if (result.status === "missing_concept") {
				new Notice("Mneme: Write the acceptance Concept before generating Cards.");
				return;
			}

			new Notice("Mneme: Pre-AI card proposal created.");
			await this.refreshOpenInboxViews();
		} catch (error) {
			console.error("Mneme: failed to generate pre-AI acceptance cards", error);
			new Notice("Mneme: failed to generate pre-AI acceptance cards. See console.");
		}
	}

	private async logPreAiAcceptanceFixture(): Promise<void> {
		try {
			const sourceExists = this.app.vault.getAbstractFileByPath(ACCEPTANCE_SOURCE_PATH) instanceof TFile;
			const conceptProposal = await this.knowledgeProposalStore.getProposal(ACCEPTANCE_CONCEPT_PROPOSAL_ID);
			const cardProposal = await this.knowledgeProposalStore.getProposal(ACCEPTANCE_CARD_PROPOSAL_ID);
			const conceptPath = buildConceptPath(this.settings.conceptsFolder, ACCEPTANCE_CONCEPT_TITLE);
			const cardPath = buildCardGroupPath(this.settings.cardsFolder, ACCEPTANCE_CONCEPT_TITLE);
			const status = {
				cardPath,
				cardProposalExists: Boolean(cardProposal),
				cardProposalStatus: cardProposal?.status,
				conceptId: ACCEPTANCE_CONCEPT_ID,
				conceptPath,
				conceptProposalExists: Boolean(conceptProposal),
				conceptProposalStatus: conceptProposal?.status,
				writtenCardExists: this.app.vault.getAbstractFileByPath(cardPath) instanceof TFile,
				writtenConceptExists: this.app.vault.getAbstractFileByPath(conceptPath) instanceof TFile,
				sourceExists,
				sourcePath: ACCEPTANCE_SOURCE_PATH,
			};

			console.info("Mneme: pre-AI acceptance fixture", status);
			new Notice("Mneme: Logged pre-AI acceptance fixture.");
		} catch (error) {
			console.error("Mneme: failed to log pre-AI acceptance fixture", error);
			new Notice("Mneme: failed to log pre-AI acceptance fixture. See console.");
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

	private async refreshOpenConceptLibraryViews(): Promise<void> {
		const refreshes = this.app.workspace.getLeavesOfType(CONCEPT_LIBRARY_VIEW_TYPE)
			.map((leaf) => leaf.view)
			.filter((view): view is MnemeConceptLibraryView => view instanceof MnemeConceptLibraryView)
			.map((view) => view.refresh());

		await Promise.all(refreshes);
	}

	private async createManualConceptFromComposer(input: ManualConceptInput): Promise<ManualConceptResult> {
		const source = input.sourcePath
			? await this.readManualConceptSourceSnapshot(input.sourcePath)
			: undefined;
		const committer = source
			? new ManualConceptProvenanceCommitter(this, source)
			: undefined;

		return createManualConcept(
			input,
			this.settings,
			new ObsidianVaultAdapter(this.app.vault),
			undefined,
			committer,
		);
	}

	private getCurrentManualConceptSourcePath(): string | undefined {
		const activeFile = this.app.workspace.getActiveFile();

		return activeFile && this.isManualConceptSourceFile(activeFile)
			? activeFile.path
			: undefined;
	}

	private listManualConceptSourcePaths(): string[] {
		return this.app.vault.getMarkdownFiles()
			.filter((file) => this.isManualConceptSourceFile(file))
			.map((file) => file.path)
			.sort((first, second) => first.localeCompare(second));
	}

	private isManualConceptSourceFile(file: TFile): boolean {
		return classifyCurrentNote(this.getNoteContext(file)) === "source_note";
	}

	private getCurrentNoteKind(): CurrentNoteKind {
		return classifyCurrentNote(this.getNoteContext(this.app.workspace.getActiveFile()));
	}

	private getNoteContext(file: TFile | null) {
		const frontmatter = file
			? this.app.metadataCache.getFileCache(file)?.frontmatter
			: undefined;

		return {
			cardsFolder: this.settings.cardsFolder,
			conceptsFolder: this.settings.conceptsFolder,
			extension: file?.extension,
			hasConceptId: !!getConceptIdFromFrontmatter(frontmatter),
			learningMode: frontmatter?.learning_mode,
			path: file?.path,
		};
	}

	private async readManualConceptSourceSnapshot(sourcePath: string): Promise<ManualConceptSourceSnapshot> {
		const abstractFile = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(abstractFile instanceof TFile) || !this.isManualConceptSourceFile(abstractFile)) {
			throw new Error("Select an existing Source Note or create the Concept without one.");
		}
		const content = await this.app.vault.cachedRead(abstractFile);

		return {
			contentHash: await computeContentHash(content),
			mtime: abstractFile.stat.mtime,
			path: abstractFile.path,
			size: abstractFile.stat.size,
		};
	}

	private async openConceptInTab(path: string): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(path);
		if (!(abstractFile instanceof TFile)) {
			new Notice("Mneme: Concept file not found.");
			return;
		}

		await this.app.workspace.getLeaf("tab").openFile(abstractFile);
	}

	private async openConceptComposerView(): Promise<void> {
		const defaultSourcePath = this.getCurrentManualConceptSourcePath();
		const existingLeaf = this.app.workspace.getLeavesOfType(CONCEPT_COMPOSER_VIEW_TYPE)[0];

		if (existingLeaf) {
			if (existingLeaf.view instanceof MnemeConceptComposerView) {
				await existingLeaf.view.prepare(defaultSourcePath);
			}
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Mneme: could not open Concept Composer.");
			return;
		}

		await leaf.setViewState({ active: true, type: CONCEPT_COMPOSER_VIEW_TYPE });
		if (leaf.view instanceof MnemeConceptComposerView) {
			await leaf.view.prepare(defaultSourcePath);
		}
		await this.app.workspace.revealLeaf(leaf);
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

	private async openInboxView(tab: InboxTab = "concepts"): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0];

		if (existingLeaf) {
			if (existingLeaf.view instanceof MnemeInboxView) {
				existingLeaf.view.showTab(tab);
				await existingLeaf.view.refresh();
			}
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
		if (leaf.view instanceof MnemeInboxView) {
			leaf.view.showTab(tab);
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	private async revealInFileExplorer(target: TAbstractFile): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType("file-explorer")[0]
			?? this.app.workspace.getLeftLeaf(false);

		if (!leaf) {
			new Notice("Mneme: could not open the file explorer.");
			return;
		}

		if (leaf.view.getViewType() !== "file-explorer") {
			await leaf.setViewState({ active: true, type: "file-explorer" });
		}

		await this.app.workspace.revealLeaf(leaf);
		const view = leaf.view as unknown as {
			revealInFolder?: (file: TAbstractFile) => void;
		};

		if (typeof view.revealInFolder === "function") {
			view.revealInFolder(target);
		}
	}

	private async openConceptLibraryView(): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(CONCEPT_LIBRARY_VIEW_TYPE)[0];

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Mneme: could not open Concept Library.");
			return;
		}

		await leaf.setViewState({
			active: true,
			type: CONCEPT_LIBRARY_VIEW_TYPE,
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	private createConceptScanner(): ConceptScanner {
		return new ConceptScanner({
			conceptSourceLinkStore: this.conceptSourceLinkStore,
			vault: new ObsidianConceptVaultAdapter(this.app),
		});
	}

	private createVaultStateReconciler(): VaultStateReconciler {
		return new VaultStateReconciler({
			conceptScanner: this.createConceptScanner(),
			conceptSourceLinkStore: this.conceptSourceLinkStore,
			knowledgeProposalStore: this.knowledgeProposalStore,
			sourceAnalysisStore: this.sourceAnalysisStore,
			vault: new ObsidianVaultAdapter(this.app.vault),
		});
	}
}

function settingsToFsrsConfig(settings: MnemeSettings): FsrsSchedulerConfig {
	return {
		enableFuzz: settings.fsrsEnableFuzz,
		maximumInterval: settings.fsrsMaximumInterval,
		requestRetention: settings.fsrsRequestRetention,
	};
}

function formatExportTimestamp(value: string): string {
	return value.replace(/[:.]/g, "-");
}

function formatNoticeDetail(message: string): string {
	const normalized = message.replace(/\s+/g, " ").trim();

	if (normalized.length <= 140) {
		return normalized.endsWith(".") ? normalized : `${normalized}.`;
	}

	return `${normalized.slice(0, 137).trim()}...`;
}

function parseCardsTargetPath(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const internalLinkMatch = value.match(/^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
	const rawPath = internalLinkMatch?.[1] ?? value;
	const path = normalizeVaultPath(rawPath);

	if (!path) {
		return undefined;
	}

	if (/\.md$/i.test(path)) {
		return path;
	}

	return getPathBasename(path).toLocaleLowerCase() === "card" ? `${path}.md` : path;
}

function getPathBasename(path: string): string {
	const parts = path.split("/").filter((part) => part.length > 0);

	return parts[parts.length - 1] ?? "";
}
