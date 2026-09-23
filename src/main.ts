import { readConceptIdRepairs, getReservedConceptRepairIds } from "./services/conceptIdRepairReceipt";
import { readCardIdRepairs } from "./services/cardIdRepairReceipt";
import { readCardDeletion } from "./services/cardDeletionReceipt";
import { Notice, Plugin, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import {
	ACCEPTANCE_CARD_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_ID,
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_TITLE,
	ACCEPTANCE_SOURCE_PATH,
} from "./acceptance/preAiAcceptanceFixture";
import type {
	KnowledgeProposal,
	NewConceptProposalPayload,
} from "./models/knowledgeProposal";
import type { ConceptSummary } from "./models/conceptLibrary";
import type { ManualConceptDraft } from "./models/manualConceptDraft";
import { ConfirmClearReviewHistoryModal } from "./modals/confirmClearReviewHistoryModal";
import { ConceptEditModal } from "./modals/conceptEditModal";
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
import type { AiOperationProgress } from "./services/aiOperationProgress";
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
import { waitForReviewableConcept } from "./services/conceptReviewAvailability";
import { ConceptMergeService } from "./services/conceptMergeService";
import { ConceptMergeAiService } from "./services/conceptMergeAiService";
import { ConceptConflictMergeDraftStore } from "./services/conceptConflictMergeDraftStore";
import { ConceptEnglishNameAiService } from "./services/conceptEnglishNameAiService";
import { ConceptDeletionService } from "./services/conceptDeletionService";
import { RecoverableConceptDeletion } from "./services/recoverableConceptDeletion";
import { ObsidianConceptDeletionVault } from "./services/obsidianConceptDeletionVault";
import { readConceptDeletions } from "./services/conceptDeletionReceipt";
import { findConceptNameConflict } from "./services/conceptNameConflict";
import { normalizeConceptNames } from "./services/conceptNaming";
import {
	getCardGroupPathFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
} from "./services/conceptMarkdownIdentity";
import { parseConceptTitle } from "./services/conceptMarkdownParser";
import { KnowledgeProposalStore } from "./services/knowledgeProposalStore";
import { runPluginDataMutation } from "./services/pluginDataMutation";
import { createKnowledgeContextPack } from "./services/knowledgeContextPackExporter";
import { ManualConceptDraftStore } from "./services/manualConceptDraftStore";
import { IncomingConceptMergeService } from "./services/incomingConceptMergeService";
import { readIncomingConceptMergeReceipt } from "./services/incomingConceptMergeRecovery";
import { ManualCardDraftStore } from "./services/manualCardDraftStore";
import type { ManualCardDraft } from "./models/manualCardDraft";
import { createManualCardWithRecovery, type ManualCardCreationResult } from "./services/manualCardWriteService";
import type { ManualConceptSourceSnapshot } from "./services/manualConceptProvenanceService";
import { createManualConceptWithRecovery, type ManualConceptCreationResult } from "./services/manualConceptWriteService";
import { ObsidianConceptVaultAdapter } from "./services/obsidianConceptVaultAdapter";
import { ObsidianAiHttpClient } from "./services/obsidianAiHttpClient";
import { ObsidianVaultAdapter } from "./services/obsidianVaultAdapter";
import { PreAiAcceptanceFixtureService } from "./services/preAiAcceptanceFixtureService";
import type { ManualConceptResult } from "./services/manualConceptService";
import { ReviewStateStore } from "./services/reviewStateStore";
import { RelatedConceptService } from "./services/relatedConceptService";
import { SourceAnalysisService } from "./services/sourceAnalysisService";
import { SourceAnalysisStore } from "./services/sourceAnalysisStore";
import { SourceProvenanceRelinkService } from "./services/sourceProvenanceRelinkService";
import { SourceProvenanceRemovalService } from "./services/sourceProvenanceRemovalService";
import { VaultStateReconciler } from "./services/vaultStateReconciler";
import type { GenerateToReviewSession } from "./services/generateToReviewWorkflow";
import { buildCardGroupPath, buildConceptPath, normalizeVaultPath } from "./utils/markdownPath";
import { computeContentHash } from "./utils/sourceHash";
import { formatUserFacingError } from "./utils/userFacingError";
import { CONCEPT_COMPOSER_VIEW_TYPE, MnemeConceptComposerView } from "./views/conceptComposerView";
import { CARD_COMPOSER_VIEW_TYPE, MnemeCardComposerView } from "./views/cardComposerView";
import { CONCEPT_LIBRARY_VIEW_TYPE, MnemeConceptLibraryView } from "./views/conceptLibraryView";
import { CONCEPT_MERGE_VIEW_TYPE, MnemeConceptMergeView } from "./views/conceptMergeView";
import {
	CONCEPT_CONFLICT_MERGE_VIEW_TYPE,
	type ConceptConflictMergeSession,
	MnemeConceptConflictMergeView,
} from "./views/conceptConflictMergeView";
import { MnemeInboxView, INBOX_VIEW_TYPE, type InboxTab } from "./views/inboxView";
import { MnemeReviewView, REVIEW_VIEW_TYPE } from "./views/reviewView";

const OBSIDIAN_GRAPH_VIEW_TYPE = "graph";
const CONCEPT_GRAPH_FILTER_QUERY = "[mneme_type:concept]";

interface AiOperationFeedback {
	finish(): void;
	update(progress: AiOperationProgress): void;
}

function isConceptConflictMergeView(view: unknown): view is MnemeConceptConflictMergeView {
	if (!view || typeof view !== "object") return false;

	// Popout leaves can belong to a different browser realm, where instanceof is unreliable.
	const candidate = view as {
		getSessionKey?: () => string | undefined;
		getViewType?: () => string;
		setSession?: (session: ConceptConflictMergeSession) => Promise<void>;
	};

	return typeof candidate.getViewType === "function"
		&& typeof candidate.getSessionKey === "function"
		&& typeof candidate.setSession === "function"
		&& candidate.getViewType() === CONCEPT_CONFLICT_MERGE_VIEW_TYPE;
}

export default class MnemePlugin extends Plugin {
	settings: MnemeSettings;
	private reviewScheduler: FsrsReviewScheduler;
	reviewStateStore: ReviewStateStore;
	private sourceAnalysisStore: SourceAnalysisStore;
	private knowledgeProposalStore: KnowledgeProposalStore;
	private conceptSourceLinkStore: ConceptSourceLinkStore;
	private manualConceptDraftStore: ManualConceptDraftStore;
	private conceptConflictMergeDraftStore: ConceptConflictMergeDraftStore;
	private manualCardDraftStore: ManualCardDraftStore;
	private approvedProposalWriter: ApprovedProposalWriter;
	private incomingConceptMergeService: IncomingConceptMergeService;
	private isUnloading = false;
	private readonly aiGenerationLock = new AiGenerationLock();
	private readonly sourceGenerationKeys = new WeakMap<TFile, string>();
	private nextSourceGenerationKey = 1;

	async onload() {
		this.isUnloading = false;
		await this.loadSettings();
		this.reviewScheduler = new FsrsReviewScheduler(settingsToFsrsConfig(this.settings));
		this.reviewStateStore = new ReviewStateStore(this, this.reviewScheduler);
		this.sourceAnalysisStore = new SourceAnalysisStore(this);
		this.knowledgeProposalStore = new KnowledgeProposalStore(this);
		this.conceptSourceLinkStore = new ConceptSourceLinkStore(this);
		this.manualConceptDraftStore = new ManualConceptDraftStore(this);
		this.conceptConflictMergeDraftStore = new ConceptConflictMergeDraftStore(this);
		this.manualCardDraftStore = new ManualCardDraftStore(this);
		this.incomingConceptMergeService = new IncomingConceptMergeService(
			new ObsidianVaultAdapter(this.app.vault),
			this,
		);
		this.approvedProposalWriter = new ApprovedProposalWriter({
			storage: this,
			conceptScanner: this.createConceptScanner(),
			isCardIdReserved: (cardId) => this.isCardIdReserved(cardId),
			isConceptIdReserved: (conceptId) => this.isConceptIdReserved(conceptId),
			settingsProvider: () => this.settings,
			vaultAdapter: new ObsidianVaultAdapter(this.app.vault),
		});
		await this.reviewStateStore.load();
		try {
			const data = await this.loadData();
			if (data?.incomingConceptMerge !== undefined
				&& readIncomingConceptMergeReceipt(data.incomingConceptMerge).status === "pending") {
				new Notice("Mneme: An Incoming Concept Merge is pending. Run Resume Incoming Concept Merge to finish it.");
			}
			if (Object.values(readConceptIdRepairs(data?.conceptIdRepairs)).some((r) => r.status === "pending")) {
				new Notice("Mneme: A Concept ID repair is pending. Run Resume Concept ID Repair to finish it.");
			}
			if (Object.values(readCardIdRepairs(data?.cardIdRepairs)).some((r) => r.status === "pending")) {
				new Notice("Mneme: A Card ID repair is pending. Run Resume Card ID Repair to finish it.");
			}
			if (readCardDeletion(data?.cardDeletion)) {
				new Notice("Mneme: A Card deletion is pending. Run Resume Card Deletion to finish it.");
			}
			if (Object.values(readConceptDeletions(data?.conceptDeletions)).some((r) => r.status === "pending")) {
				new Notice("Mneme: A Concept deletion is pending. Run Resume Concept Deletion to finish it.");
			}
		} catch (error) {
			console.error("Mneme: could not read recovery records", error);
			new Notice("Mneme: Could not read recovery records. Inspect data.json before changing Cards or Concepts.");
		}
		const conceptMergeService = new ConceptMergeService(
			new ObsidianVaultAdapter(this.app.vault, this.app.metadataCache),
			this,
		);
		const conceptMergeAiService = new ConceptMergeAiService({
			httpClient: new ObsidianAiHttpClient(),
			settingsProvider: () => this.settings,
		});
		const conceptEnglishNameAiService = new ConceptEnglishNameAiService({
			httpClient: new ObsidianAiHttpClient(),
			settingsProvider: () => this.settings,
		});

		this.addSettingTab(new MnemeSettingTab(this.app, this));
		this.registerView(REVIEW_VIEW_TYPE, (leaf) => new MnemeReviewView(
			leaf,
			this.reviewStateStore,
			() => this.settings,
			{
				deleteConcept: (concept) => this.deleteConcept(concept),
				openConceptLibrary: () => this.openConceptLibraryView(),
			},
		));
		this.registerView(INBOX_VIEW_TYPE, (leaf) => new MnemeInboxView(
			leaf,
			this.knowledgeProposalStore,
			this.approvedProposalWriter,
			this.createVaultStateReconciler(),
			{
				discardMergeDraft: (key) => this.conceptConflictMergeDraftStore.clearDraft(key),
				englishAliasesEnabled: () => this.settings.suggestEnglishAliases,
				listConceptTags: async () => (await this.createConceptScanner().scanConcepts())
					.flatMap((concept) => concept.tags ?? []),
				mergeConcepts: (existing, proposalId, onReturn) => this.openInboxConflictMerge(
					existing,
					proposalId,
					onReturn,
				),
				openConceptLibrary: () => this.openConceptLibraryView(),
				startConceptReview: (conceptId) => this.reviewCardsFromConceptLibrary(conceptId, {
					waitForFreshCards: true,
				}),
			},
		));
		this.registerView(CONCEPT_LIBRARY_VIEW_TYPE, (leaf) => new MnemeConceptLibraryView(
			leaf,
			this.createConceptScanner(),
			this.reviewStateStore,
			{
				createConcept: () => this.openConceptComposerView(),
				createCard: (concept) => this.openCardComposerView(concept.conceptId),
				deleteConcept: (concept) => this.deleteConcept(concept),
				getGlobalRetentionTarget: () => this.settings.fsrsRequestRetention,
				relatedConceptService: new RelatedConceptService(new ObsidianVaultAdapter(this.app.vault, this.app.metadataCache)),
				sourceRelinkService: new SourceProvenanceRelinkService(
					new ObsidianVaultAdapter(this.app.vault),
					this,
				),
				sourceRemovalService: new SourceProvenanceRemovalService(
					new ObsidianVaultAdapter(this.app.vault),
					this,
				),
				generateCards: (concept) => this.generateCardsToReviewFromConceptPath(concept.path),
				mergeConcepts: (first, second) => this.openConceptMergeView(first, second),
				reviewCards: (concept) => this.reviewCardsFromConceptLibrary(concept.conceptId),
			},
		));
		this.registerView(CONCEPT_MERGE_VIEW_TYPE, (leaf) => new MnemeConceptMergeView(
			leaf,
			this.createConceptScanner(),
			{
				aiService: conceptMergeAiService,
				englishAliasesEnabled: () => this.settings.suggestEnglishAliases,
				getDismissedPairKeys: () => Object.keys(this.reviewStateStore.getConceptDuplicateDismissals()),
				mergeService: conceptMergeService,
				onMerged: async () => {
					await this.reviewStateStore.load();
					await Promise.all([
						this.refreshOpenConceptLibraryViews(),
						this.refreshReviewViews(),
					]);
				},
				openConcept: async (concept) => this.openConceptDetail(
					concept,
					await this.createConceptScanner().scanConcepts(),
				),
				readMarkdown: async (path) => {
					const file = this.app.vault.getAbstractFileByPath(path);
					if (!(file instanceof TFile)) throw new Error(`Markdown file not found: ${path}`);
					return this.app.vault.cachedRead(file);
				},
				reviewCards: (conceptId) => this.reviewCardsFromConceptLibrary(conceptId),
			},
		));
		this.registerView(CONCEPT_CONFLICT_MERGE_VIEW_TYPE, (leaf) => new MnemeConceptConflictMergeView(
			leaf,
			{
				aiService: conceptMergeAiService,
				draftStore: this.conceptConflictMergeDraftStore,
				englishAliasesEnabled: () => this.settings.suggestEnglishAliases,
				mergeService: this.incomingConceptMergeService,
				onMerged: (session) => this.finishConflictMerge(session),
				readMarkdown: (path) => this.readMarkdownFile(path),
				shouldReturnOnClose: () => !this.isUnloading,
			},
		));
		this.registerView(CONCEPT_COMPOSER_VIEW_TYPE, (leaf) => new MnemeConceptComposerView(leaf, {
			canSuggestEnglishName: () => conceptEnglishNameAiService.isAvailable(),
			create: (input) => this.createManualConceptFromComposer(input),
			discardMergeDraft: (key) => this.conceptConflictMergeDraftStore.clearDraft(key),
			draftStore: this.manualConceptDraftStore,
			englishAliasesEnabled: () => this.settings.suggestEnglishAliases,
			findNameConflict: async (input) => findConceptNameConflict(
				input,
				this.settings,
				await this.createConceptScanner().scanConcepts(),
			),
			getCurrentSourcePath: () => this.getCurrentManualConceptSourcePath(),
			listSourcePaths: () => this.listManualConceptSourcePaths(),
			onCreated: async () => {
				await Promise.all([
					this.refreshOpenConceptLibraryViews(),
					this.refreshReviewViews(),
				]);
			},
			openMerge: (existing, draft, onReturn) => this.openManualConflictMerge(
				existing,
				draft,
				onReturn,
			),
			openConceptMarkdown: (path) => this.openConceptInTab(path),
			scanConcepts: () => this.createConceptScanner().scanConcepts(),
			suggestEnglishName: (title, coreMeaning) => conceptEnglishNameAiService.suggest(title, coreMeaning),
			viewConcept: (result) => this.viewManualConcept(result),
		}));
		this.registerView(CARD_COMPOSER_VIEW_TYPE, (leaf) => new MnemeCardComposerView(leaf, {
			create: (draft, concept) => this.createManualCardFromComposer(draft, concept),
			draftStore: this.manualCardDraftStore,
			listConcepts: () => this.createConceptScanner().scanConcepts(),
			onCreated: async () => {
				await Promise.all([
					this.refreshOpenConceptLibraryViews(),
					this.refreshReviewViews(),
				]);
			},
			openCardsMarkdown: (path) => this.openMarkdownInTab(path, "Cards"),
			viewConcept: async (concept) => this.openConceptDetail(
				concept,
				await this.createConceptScanner().scanConcepts(),
			),
		}));

		this.registerProductCommands();
		if (this.settings.enableDeveloperTools) {
			this.registerDeveloperCommands();
		}
	}

	onunload() {
		this.isUnloading = true;
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
			id: "mneme-create-card",
			name: "Create Card",
			callback: () => {
				void this.openCardComposerForCurrentConcept();
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
			id: "mneme-open-concepts-graph",
			name: "Open Concepts Graph",
			callback: () => {
				void this.openConceptsGraph();
			},
		});

		this.addCommand({
			id: "mneme-merge-concepts",
			name: "Merge Concepts",
			callback: () => {
				void this.openConceptMergeView();
			},
		});

		this.addCommand({
			id: "mneme-resume-incoming-concept-merge",
			name: "Resume Incoming Concept Merge",
			callback: () => { void this.resumeIncomingConceptMerge(); },
		});

		this.addCommand({
			id: "mneme-resume-concept-id-repair",
			name: "Resume Concept ID Repair",
			callback: () => { void this.resumeConceptIdRepair(); },
		});

		this.addCommand({
			id: "mneme-resume-card-id-repair",
			name: "Resume Card ID Repair",
			callback: () => { void this.resumeCardIdRepair(); },
		});

		this.addCommand({
			id: "mneme-resume-card-deletion",
			name: "Resume Card Deletion",
			callback: () => { void this.resumeCardDeletion(); },
		});

		this.addCommand({
			id: "mneme-resume-concept-deletion",
			name: "Resume Concept Deletion",
			callback: () => { void this.resumeConceptDeletion(); },
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
		await runPluginDataMutation(this, async () => {
			await this.saveData(mergeSettingsIntoPluginData(await this.loadData(), this.settings));
			this.reviewStateStore?.setSettings(this.settings);
		});
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
		const feedback = this.createAiOperationFeedback("Analyzing current note…");
		const service = new AiConceptCaptureService({
			createProvider: (settings) => createAiProvider(settings, new ObsidianAiHttpClient()),
			existingTagsProvider: async () => (await this.createConceptScanner().scanConcepts())
				.flatMap((concept) => concept.tags ?? []),
			generationLock: this.aiGenerationLock,
			onProgress: (progress) => feedback.update(progress),
			proposalStore: this.knowledgeProposalStore,
			readSourceContent,
			resolveCurrentSource: () => this.resolveCurrentSource(activeFile),
			settingsProvider: () => this.settings,
			sourceAnalysisService,
			sourceAnalysisStore: this.sourceAnalysisStore,
		});
		const result = await (async () => {
			try {
				return await service.analyze({
					mtime: activeFile.stat.mtime,
					path: activeFile.path,
					size: activeFile.stat.size,
				}, {
					generationKey: this.getSourceGenerationKey(activeFile),
				});
			} finally {
				feedback.finish();
			}
		})();

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

		if (result.status === "source_changed") {
			new Notice(`Mneme: ${formatNoticeDetail(result.message)} No proposals added.`);
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

	private async resolveCurrentSource(sourceFile: TFile): Promise<{
		contentHash: string;
		mtime: number;
		path: string;
		size: number;
	} | undefined> {
		const currentFile = this.app.vault.getAbstractFileByPath(sourceFile.path);

		if (!(currentFile instanceof TFile) || currentFile !== sourceFile) {
			return undefined;
		}

		const content = await this.app.vault.cachedRead(currentFile);

		return {
			contentHash: await computeContentHash(content),
			mtime: currentFile.stat.mtime,
			path: currentFile.path,
			size: currentFile.stat.size,
		};
	}

	private getSourceGenerationKey(sourceFile: TFile): string {
		const existing = this.sourceGenerationKeys.get(sourceFile);
		if (existing) return existing;

		const key = `source-file-${this.nextSourceGenerationKey}`;
		this.nextSourceGenerationKey += 1;
		this.sourceGenerationKeys.set(sourceFile, key);

		return key;
	}

	private createAiOperationFeedback(initialMessage: string): AiOperationFeedback {
		const notice = new Notice(`Mneme: ${initialMessage}`, 0);
		const statusEl = this.addStatusBarItem();
		statusEl.addClass("mneme-ai-operation-status");
		statusEl.setAttr("aria-live", "polite");
		statusEl.setAttr("role", "status");
		let finished = false;

		const updateMessage = (message: string) => {
			if (finished) return;
			notice.setMessage(`Mneme: ${message}`);
			statusEl.setText(`Mneme · ${stripTrailingEllipsis(message)}`);
		};

		updateMessage(initialMessage);

		return {
			finish: () => {
				if (finished) return;
				finished = true;
				notice.hide();
				statusEl.remove();
			},
			update: ({ message }) => updateMessage(message),
		};
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

	private async generateCardsToReviewFromConceptPath(conceptPath: string): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(conceptPath);

		if (!(abstractFile instanceof TFile)) {
			new Notice("Mneme: Concept file not found.");
			return;
		}

		await this.generateCardsFromConceptFile(abstractFile, { generateToReview: true });
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

		const cardsTarget = getCardGroupPathFromConceptFrontmatter(frontmatter)
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

	private async generateCardsFromConceptFile(
		conceptFile: TFile,
		options: { generateToReview?: boolean } = {},
	): Promise<void> {
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
		const existingCardTypes = loadedConcepts.concepts
			.find((concept) => concept.id === conceptId)
			?.cards.filter((card) => card.isValid && card.cardType).map((card) => card.cardType!) ?? [];
		const feedback = this.createAiOperationFeedback("Generating Card proposals…");
		const service = new AiCardGenerationService({
			createProvider: (settings) => createAiProvider(settings, new ObsidianAiHttpClient()),
			generationLock: this.aiGenerationLock,
			onProgress: (progress) => feedback.update(progress),
			proposalStore: this.knowledgeProposalStore,
			settingsProvider: () => this.settings,
			sourceAnalysisStore: this.sourceAnalysisStore,
		});
		const result = await (async () => {
			try {
				return await service.generate({
					conceptId,
					conceptMtime: conceptFile.stat.mtime,
					conceptPath: conceptFile.path,
					conceptSize: conceptFile.stat.size,
					conceptTitle,
					existingCardFronts,
					existingCardTypes,
					markdown,
				});
			} finally {
				feedback.finish();
			}
		})();

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
			if (options.generateToReview && result.proposalIds.length > 0) {
				await this.openInboxView("cards", {
					conceptId,
					conceptTitle,
					proposalIds: result.proposalIds,
				});
				return;
			}

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
			try {
				await this.refreshOpenInboxViews();
				new Notice(`Mneme: ${result.message}`);
			} catch (error) {
				console.error("Mneme: index resynced but Inbox could not refresh", error);
				new Notice(`Mneme: ${result.message} Inbox refresh failed: ${formatUserFacingError(error, "Reopen Inbox.")}`);
			}
		} catch (error) {
			console.error("Mneme: failed to resync index", error);
			new Notice(`Mneme: Index resync failed: ${formatUserFacingError(error, "Try again.")}`);
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
			new Notice(`Mneme: Knowledge Context Pack export failed: ${formatUserFacingError(error, "Try again.")}`);
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
			new Notice(`Mneme: Anki TSV export failed: ${formatUserFacingError(error, "Try again.")}`);
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
			await this.refreshReviewViews();
		} catch (error) {
			console.error("Mneme: failed to clear review history", error);
			new Notice("Mneme: failed to clear review history. See console for details.");
		}
	}

	async refreshReviewViews(): Promise<void> {
		const refreshes = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)
			.map((leaf) => leaf.view)
			.filter((view): view is MnemeReviewView => view instanceof MnemeReviewView)
			.map((view) => view.refreshCards());

		await Promise.all(refreshes);
	}

	refreshReviewPresentation(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)) {
			if (leaf.view instanceof MnemeReviewView) leaf.view.refreshPresentation();
		}
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

	private async createManualConceptFromComposer(draft: ManualConceptDraft): Promise<ManualConceptCreationResult> {
		return createManualConceptWithRecovery(
			draft,
			this.settings,
			new ObsidianVaultAdapter(this.app.vault),
			this,
			{
				isConceptIdReserved: (conceptId) => this.isConceptIdReserved(conceptId),
				readSourceSnapshot: (path) => this.readManualConceptSourceSnapshot(path),
			},
		);
	}

	private async isConceptIdReserved(conceptId: string): Promise<boolean> {
		const data = await this.loadData();
		if (getReservedConceptRepairIds(data?.conceptIdRepairs).includes(conceptId)) return true;
		if (readConceptDeletions(data?.conceptDeletions)[conceptId]) return true;
		if (this.reviewStateStore.getConceptMergeRecords()[conceptId]) {
			return true;
		}

		const result = await this.createConceptScanner().scan();

		return result.concepts.some((concept) => concept.conceptId === conceptId)
			|| result.identityIssues.some((issue) => issue.conceptId === conceptId);
	}

	private async isCardIdReserved(cardId: string): Promise<boolean> {
		if (this.getHistoricalCardIds().has(cardId)) {
			return true;
		}

		const cards = await new CardFileLoader(this.app).loadCardFiles();
		return cards.some((card) => card.hasExplicitCardId && card.cardId === cardId);
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
		return this.openMarkdownInTab(path, "Concept");
	}

	private async openMarkdownInTab(path: string, label: "Cards" | "Concept"): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(path);
		if (!(abstractFile instanceof TFile)) {
			new Notice(`Mneme: ${label} file not found.`);
			return;
		}

		await this.app.workspace.getLeaf("tab").openFile(abstractFile);
	}

	private async viewManualConcept(result: ManualConceptResult): Promise<void> {
		try {
			const concepts = await this.createConceptScanner().scanConcepts();
			const concept = concepts.find((candidate) => candidate.conceptId === result.conceptId)
				?? concepts.find((candidate) => candidate.path === result.path);
			if (!concept) {
				new Notice("Mneme: created Concept could not be loaded.");
				return;
			}

			this.openConceptDetail(concept, concepts);
		} catch (error) {
			console.error("Mneme: created Concept could not be opened", error);
			new Notice("Mneme: created Concept could not be opened.");
		}
	}

	private openConceptDetail(concept: ConceptSummary, concepts: ConceptSummary[]): void {
		const current = concepts.find((candidate) => (
			candidate.conceptId === concept.conceptId && candidate.path === concept.path
		));
		if (!current) {
			new Notice("Mneme: Concept was not found. Refresh the view and try again.");
			return;
		}
		new ConceptEditModal(this.app, {
			concept: current,
			concepts,
			createCard: () => this.openCardComposerView(current.conceptId),
			deleteConcept: () => this.deleteConcept(current),
			globalRetentionTarget: this.settings.fsrsRequestRetention,
			onOpenRelated: (related) => this.openConceptDetail(related, concepts),
			onSaved: () => this.refreshOpenConceptLibraryViews(),
			relatedConceptService: new RelatedConceptService(new ObsidianVaultAdapter(this.app.vault, this.app.metadataCache)),
		}).open();
	}

	private async deleteConcept(concept: ConceptSummary): Promise<void> {
		const concepts = await this.createConceptScanner().scanConcepts();
		const current = concepts.find((candidate) => (
			candidate.conceptId === concept.conceptId && candidate.path === concept.path
		));
		if (!current) {
			throw new Error("Concept was not found. Refresh the view and try again.");
		}

		const service = new ConceptDeletionService(new ObsidianConceptDeletionVault(this.app.vault, this.app.metadataCache));
		const prepared = await service.prepare(current, concepts);
		if (prepared.status === "blocked") {
			throw new Error(prepared.message);
		}

		try {
			await this.createConceptDeletion().delete(prepared.plan);
		} catch (error) {
			throw new Error(`${formatUserFacingError(error, "Deletion stopped.")} Run Resume Concept Deletion if a deletion record was saved.`);
		}
		await this.refreshAfterConceptDeletion();
	}

	private createConceptDeletion(): RecoverableConceptDeletion {
		return new RecoverableConceptDeletion(new ObsidianConceptDeletionVault(this.app.vault, this.app.metadataCache), this);
	}

	private async resumeConceptIdRepair(): Promise<void> {
		try {
			const resumed = await this.reviewStateStore.resumeConceptIdRepair(new ObsidianVaultAdapter(this.app.vault));
			new Notice(resumed ? "Mneme: Concept ID repair completed." : "Mneme: No pending Concept ID repair.");
		} catch (error) {
			console.error("Mneme: failed to resume Concept ID repair", error);
			new Notice(`Mneme: ${formatUserFacingError(error, "Could not resume Concept ID repair.")}`);
			return;
		}
		try {
			await this.reviewStateStore.load();
			await Promise.all([this.refreshReviewViews(), this.refreshOpenConceptLibraryViews()]);
		} catch (error) {
			console.error("Mneme: Concept ID repair finished but views could not refresh", error);
			new Notice("Mneme: Reopen Mneme views to refresh them.");
		}
	}

	private async resumeCardIdRepair(): Promise<void> {
		try {
			const resumed = await this.reviewStateStore.resumeCardIdRepair(new ObsidianVaultAdapter(this.app.vault));
			new Notice(resumed ? "Mneme: Card ID repair completed." : "Mneme: No pending Card ID repair.");
		} catch (error) {
			console.error("Mneme: failed to resume Card ID repair", error);
			new Notice(`Mneme: ${formatUserFacingError(error, "Could not resume Card ID repair.")}`);
			return;
		}
		try {
			await this.reviewStateStore.load();
			await Promise.all([this.refreshReviewViews(), this.refreshOpenConceptLibraryViews()]);
		} catch (error) {
			console.error("Mneme: Card ID repair finished but views could not refresh", error);
			new Notice("Mneme: Reopen Mneme views to refresh them.");
		}
	}

	private async resumeCardDeletion(): Promise<void> {
		try {
			const resumed = await this.reviewStateStore.resumeCardDeletion(new ObsidianVaultAdapter(this.app.vault));
			new Notice(resumed ? "Mneme: Card deletion completed." : "Mneme: No pending Card deletion.");
		} catch (error) {
			console.error("Mneme: failed to resume Card deletion", error);
			new Notice(`Mneme: ${formatUserFacingError(error, "Could not resume Card deletion.")}`);
			return;
		}
		try {
			await this.reviewStateStore.load();
			await Promise.all([this.refreshReviewViews(), this.refreshOpenConceptLibraryViews()]);
		} catch (error) {
			console.error("Mneme: Card deletion finished but views could not refresh", error);
			new Notice("Mneme: Reopen Mneme views to refresh them.");
		}
	}

	private async resumeConceptDeletion(): Promise<void> {
		try {
			const resumed = await this.createConceptDeletion().resume();
			await this.refreshAfterConceptDeletion();
			new Notice(resumed ? "Mneme: Concept deletion completed." : "Mneme: No pending Concept deletion.");
		} catch (error) {
			console.error("Mneme: failed to resume Concept deletion", error);
			new Notice(`Mneme: ${formatUserFacingError(error, "Could not resume Concept deletion.")}`);
		}
	}

	private async refreshAfterConceptDeletion(): Promise<void> {
		try {
			await this.reviewStateStore.load();
		} catch (error) {
			console.error("Mneme: could not reload state after Concept deletion", error);
			new Notice("Mneme: Concept deleted. Reload Mneme to refresh review state.");
		}

		try {
			await this.createVaultStateReconciler().reconcile();
		} catch (error) {
			console.error("Mneme: Concept deleted but stale indexes could not be reconciled", error);
			new Notice("Mneme: Concept deleted, but index cleanup will retry on the next refresh.");
		}
		try {
			await Promise.all([
				this.refreshOpenConceptLibraryViews(),
				this.refreshReviewViews(),
			]);
		} catch (error) {
			console.error("Mneme: Concept deleted but dependent views could not refresh", error);
			new Notice("Mneme: Concept deleted. Reopen Mneme views to refresh them.");
		}
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

	private async openCardComposerForCurrentConcept(): Promise<void> {
		const activePath = this.app.workspace.getActiveFile()?.path;
		let conceptId: string | undefined;
		if (activePath) {
			const concepts = await this.createConceptScanner().scanConcepts();
			conceptId = concepts.find((concept) => concept.path === activePath)?.conceptId;
		}
		await this.openCardComposerView(conceptId);
	}

	private async openCardComposerView(defaultConceptId?: string): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(CARD_COMPOSER_VIEW_TYPE)[0];
		if (existingLeaf) {
			if (existingLeaf.view instanceof MnemeCardComposerView) {
				await existingLeaf.view.prepare(defaultConceptId);
			}
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Mneme: could not open Card Composer.");
			return;
		}
		await leaf.setViewState({ active: true, type: CARD_COMPOSER_VIEW_TYPE });
		if (leaf.view instanceof MnemeCardComposerView) await leaf.view.prepare(defaultConceptId);
		await this.app.workspace.revealLeaf(leaf);
	}

	private async createManualCardFromComposer(draft: ManualCardDraft, concept?: ConceptSummary): Promise<ManualCardCreationResult> {
		const reservedCardIds = this.getHistoricalCardIds();
		for (const card of await new CardFileLoader(this.app).loadCardFiles()) {
			if (card.hasExplicitCardId) {
				reservedCardIds.add(card.cardId);
			}
		}

		return createManualCardWithRecovery(
			draft,
			concept,
			this.settings,
			new ObsidianVaultAdapter(this.app.vault),
			this,
			reservedCardIds,
		);
	}

	private getHistoricalCardIds(): Set<string> {
		return new Set([
			...Object.keys(this.reviewStateStore.getAllStates()),
			...Object.keys(this.reviewStateStore.getCardTombstones()),
			...Object.keys(this.reviewStateStore.getActiveReviewDeferrals()),
			...Object.keys(this.reviewStateStore.getSuspendedCards()),
			...Object.keys(this.reviewStateStore.getRetiredCards()),
			...this.reviewStateStore.getReviewEvents().map((event) => event.cardId),
		]);
	}

	private async openReviewView() {
		const existingLeaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0];

		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return existingLeaf;
		}

		const leaf = this.openMnemeWorkspaceLeaf();
		if (!leaf) {
			new Notice("Mneme: could not open Review View.");
			return undefined;
		}

		await leaf.setViewState({
			active: true,
			type: REVIEW_VIEW_TYPE,
		});
		await this.app.workspace.revealLeaf(leaf);
		return leaf;
	}

	private async reviewCardsFromConceptLibrary(
		conceptId: string,
		options: { waitForFreshCards?: boolean } = {},
	): Promise<"failed" | "no_cards" | "started"> {
		const loader = new ConceptLoader(this.app);
		const hasReviewableCards = options.waitForFreshCards
			? await waitForReviewableConcept(
				async () => (await loader.loadConcepts()).concepts,
				conceptId,
			)
			: await waitForReviewableConcept(
				async () => (await loader.loadConcepts()).concepts,
				conceptId,
				{ attempts: 1 },
			);

		if (!hasReviewableCards) {
			return "no_cards";
		}

		const leaf = await this.openReviewView();
		if (!leaf || !(leaf.view instanceof MnemeReviewView)) {
			new Notice("Mneme: could not open Review Cards.");
			return "failed";
		}

		const result = await leaf.view.startConceptReview(conceptId);

		if (result === "not_found") {
			new Notice("Mneme: Concept not found in Review.");
			return "failed";
		}

		if (result === "no_reviewable_cards") {
			new Notice("Mneme: this Concept has no valid Cards to review.");
			return "failed";
		}

		return "started";
	}

	private async openInboxView(
		tab: InboxTab = "concepts",
		generateToReviewSession?: GenerateToReviewSession,
	): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0];

		if (existingLeaf) {
			if (existingLeaf.view instanceof MnemeInboxView) {
				if (generateToReviewSession) {
					await existingLeaf.view.startGenerateToReview(generateToReviewSession);
				} else {
					existingLeaf.view.showTab(tab);
					await existingLeaf.view.refresh();
				}
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
			if (generateToReviewSession) {
				await leaf.view.startGenerateToReview(generateToReviewSession);
			} else {
				leaf.view.showTab(tab);
			}
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
			if (existingLeaf.view instanceof MnemeConceptLibraryView) {
				await existingLeaf.view.refresh();
			}
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.openMnemeWorkspaceLeaf();
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

	private async openConceptsGraph(): Promise<void> {
		try {
			const existingLeaf = this.app.workspace.getLeavesOfType(OBSIDIAN_GRAPH_VIEW_TYPE)[0];
			const leaf = existingLeaf ?? this.app.workspace.getLeaf("tab");

			if (!existingLeaf) {
				await leaf.setViewState({
					active: true,
					type: OBSIDIAN_GRAPH_VIEW_TYPE,
				});
			}

			await this.app.workspace.revealLeaf(leaf);
			new Notice(
				`Mneme: In Graph settings → Filters → Search files, enter ${CONCEPT_GRAPH_FILTER_QUERY}`,
				12_000,
			);
		} catch (error) {
			console.error("Mneme: could not open Concepts Graph", error);
			new Notice("Mneme: Could not open Graph View. Make sure Obsidian's Graph view core plugin is enabled.");
		}
	}

	private async openConceptMergeView(first?: ConceptSummary, second?: ConceptSummary): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(CONCEPT_MERGE_VIEW_TYPE)[0];
		if (existingLeaf) {
			if (existingLeaf.view instanceof MnemeConceptMergeView) {
				if (first) await existingLeaf.view.setSelection(first, second);
				else await existingLeaf.view.refresh();
			}
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.openMnemeWorkspaceLeaf();
		if (!leaf) {
			new Notice("Mneme: could not open Merge Concepts.");
			return;
		}
		await leaf.setViewState({ active: true, type: CONCEPT_MERGE_VIEW_TYPE });
		if (first && leaf.view instanceof MnemeConceptMergeView) {
			await leaf.view.setSelection(first, second);
		}
		await this.app.workspace.revealLeaf(leaf);
	}

	private async openInboxConflictMerge(
		existing: ConceptSummary,
		proposalId: string,
		onReturn: () => Promise<void>,
	): Promise<void> {
		const proposal = await this.knowledgeProposalStore.getProposal(proposalId);
		if (proposal?.kind !== "new_concept" || !proposal.payload) {
			throw new Error("The incoming Concept Proposal is no longer available.");
		}
		const incoming = createIncomingConceptSummary(
			`incoming:${proposal.id}`,
			proposal.payload,
			this.settings.suggestEnglishAliases,
		);
		const incomingFingerprint = await computeContentHash(JSON.stringify({
			existingConceptId: existing.conceptId,
			payload: proposal.payload,
			proposalId: proposal.id,
			updatedAt: proposal.updatedAt,
		}));
		await this.openConceptConflictMergeView({
			existing,
			incoming,
			incomingFingerprint,
			incomingMarkdown: renderIncomingConceptMarkdown(
				incoming,
				proposal.payload.proposedViews,
			),
			key: `inbox:${proposal.id}`,
			onReturn,
			origin: {
				kind: "inbox",
				proposalId: proposal.id,
				proposalUpdatedAt: proposal.updatedAt,
			},
		});
	}

	private async openManualConflictMerge(
		existing: ConceptSummary,
		draft: ManualConceptDraft,
		onReturn: () => Promise<void>,
	): Promise<void> {
		const state = await this.manualConceptDraftStore.getState();
		if (state.pendingWrite) throw new Error("Resume the pending Concept creation before opening Merge.");
		if (state.draft.draftId !== draft.draftId) throw new Error("This Composer draft is out of date. Reopen Concept Composer before opening Merge.");
		const source = draft.sourcePath
			? await this.readManualConceptSourceSnapshot(draft.sourcePath)
			: undefined;
		const incoming = createIncomingConceptSummary(
			"incoming:manual",
			{
				coreMeaning: draft.coreMeaning,
				englishName: draft.englishName,
				learningMode: draft.learningMode,
				suggestedImportance: draft.importance,
				tags: draft.tags,
				title: draft.title,
				whyItMatters: draft.whyItMatters,
			},
			this.settings.suggestEnglishAliases,
		);
		const incomingFingerprint = await computeContentHash(JSON.stringify({
			draft,
			existingConceptId: existing.conceptId,
			sourceHash: source?.contentHash,
		}));
		await this.openConceptConflictMergeView({
			existing,
			incoming,
			incomingFingerprint,
			incomingMarkdown: renderIncomingConceptMarkdown(incoming),
			key: "manual",
			onReturn,
			origin: {
				input: draft,
				kind: "manual",
				source,
			},
		});
	}

	private async openConceptConflictMergeView(session: ConceptConflictMergeSession): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(CONCEPT_CONFLICT_MERGE_VIEW_TYPE)
			.find((leaf) => (
				isConceptConflictMergeView(leaf.view)
					&& leaf.view.getSessionKey() === session.key
			));
		if (existingLeaf) {
			if (isConceptConflictMergeView(existingLeaf.view)) {
				await existingLeaf.view.setSession(session);
			}
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.openMnemeWorkspaceLeaf();
		if (!leaf) throw new Error("Could not open the conflict Merge workspace.");
		await leaf.setViewState({ active: true, type: CONCEPT_CONFLICT_MERGE_VIEW_TYPE });
		if (!isConceptConflictMergeView(leaf.view)) {
			throw new Error("Conflict Merge workspace did not initialize.");
		}
		await leaf.view.setSession(session);
		await this.app.workspace.revealLeaf(leaf);
	}

	private async finishConflictMerge(session: ConceptConflictMergeSession): Promise<void> {
		await this.reviewStateStore.load();
		if (session.origin.kind === "manual") {
			for (const leaf of this.app.workspace.getLeavesOfType(CONCEPT_COMPOSER_VIEW_TYPE)) {
				if (leaf.view instanceof MnemeConceptComposerView) {
					await leaf.view.completeConflictMerge(session.origin.input.draftId);
				}
			}
		}
		await Promise.all([
			this.refreshOpenConceptLibraryViews(),
			this.refreshOpenInboxViews(),
			this.refreshReviewViews(),
		]);
	}

	private async resumeIncomingConceptMerge(): Promise<void> {
		try {
			const result = await this.incomingConceptMergeService.resume();
			if (result.status === "failed" || result.status === "conflict") {
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			if (result.status === "merged") {
				for (const leaf of this.app.workspace.getLeavesOfType(CONCEPT_CONFLICT_MERGE_VIEW_TYPE)) {
					if (isConceptConflictMergeView(leaf.view)) leaf.view.completeRecoveredMerge(result.receipt);
				}
			}
			if (result.status === "merged" && result.manualDraftId) {
				for (const leaf of this.app.workspace.getLeavesOfType(CONCEPT_COMPOSER_VIEW_TYPE)) {
					if (leaf.view instanceof MnemeConceptComposerView) {
						await leaf.view.completeConflictMerge(result.manualDraftId);
					}
				}
			}
			await this.reviewStateStore.load();
			await Promise.all([
				this.refreshOpenConceptLibraryViews(),
				this.refreshOpenInboxViews(),
				this.refreshReviewViews(),
			]);
			new Notice(result.status === "merged" ? "Mneme: Incoming Concept Merge completed."
				: result.status === "not-applied" ? "Mneme: Merge was not applied. Your draft was preserved. Reopen Merge and review the preview."
					: "Mneme: No pending Incoming Concept Merge.");
		} catch (error) {
			console.error("Mneme: failed to resume Incoming Concept Merge", error);
			new Notice(`Mneme: ${formatUserFacingError(error, "Could not resume Incoming Concept Merge.")}`);
		}
	}

	private openMnemeWorkspaceLeaf(): WorkspaceLeaf | undefined {
		try {
			return this.app.workspace.openPopoutLeaf();
		} catch (error) {
			console.info("Mneme: popout window unavailable, opening in a workspace tab", error);
			return this.app.workspace.getLeaf("tab");
		}
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

function stripTrailingEllipsis(message: string): string {
	return message.endsWith("…") ? message.slice(0, -1) : message;
}

function createIncomingConceptSummary(
	conceptId: string,
	payload: NewConceptProposalPayload,
	englishAliasesEnabled: boolean,
): ConceptSummary {
	const names = normalizeConceptNames(
		payload.title,
		payload.englishName,
		englishAliasesEnabled,
	);

	return {
		conceptId,
		coreMeaning: payload.coreMeaning?.trim() || "",
		englishName: names.englishName || undefined,
		importance: payload.suggestedImportance ?? "normal",
		learningMode: payload.learningMode ?? "reviewable",
		path: "",
		primaryTitle: names.title,
		tags: [...(payload.tags ?? [])],
		title: names.displayTitle,
		whyItMatters: payload.whyItMatters?.trim() || "",
	};
}

function renderIncomingConceptMarkdown(
	incoming: ConceptSummary,
	views: NewConceptProposalPayload["proposedViews"] = [],
): string {
	const lines = [
		`# ${incoming.title}`,
		"",
		"## Core Meaning",
		"",
		incoming.coreMeaning?.trim() || "",
	];
	if (incoming.whyItMatters?.trim()) {
		lines.push(
			"",
			"## Why It Matters",
			"",
			incoming.whyItMatters.trim(),
		);
	}
	const visibleViews = (views ?? []).filter((view) => view.title.trim() && view.body.trim());
	if (visibleViews.length > 0) {
		lines.push("", "## Views");
	}
	for (const view of visibleViews) {
		lines.push(
			"",
			`### ${view.title.trim()}`,
			"",
			view.body.trim(),
		);
	}

	return `${lines.join("\n").trimEnd()}\n`;
}
