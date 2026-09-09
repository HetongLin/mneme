import { RecoverableConceptIdRepair, type ConceptIdRepairVault } from "./recoverableConceptIdRepair";
import { assertConceptIdRepairAllowsConcept, readConceptIdRepairs } from "./conceptIdRepairReceipt";
import { withRekeyedConceptPause } from "./conceptIdRepairState";
import type { ConceptIdentityIssue } from "../models/conceptLibrary";
import { RecoverableCardIdRepair, type CardIdRepairInput, type CardIdRepairVault } from "./recoverableCardIdRepair";
import { withRekeyedCardState } from "./cardIdRepairState";
import { assertCardIdRepairAllowsCard } from "./cardIdRepairReceipt";
import { assertCardDeletionAllowsCard } from "./cardDeletionReceipt";
import { withDeletedCardState } from "./cardDeletionState";
import { RecoverableCardDeletion, type CardDeletionInput, type CardDeletionVault } from "./recoverableCardDeletion";
import { assertCardNotDeleting } from "./conceptDeletionReceipt";
import { ReviewScheduler } from "../models/reviewScheduler";
import {
	CardReviewState,
	CardReviewSuspension,
	CardRetirement,
	CardReviewEvent,
	CardTombstone,
	ConceptDuplicateDismissal,
	ConceptMergeRecord,
	ConceptReviewPause,
	MnemePluginData,
	ReviewDeferral,
	ReviewRating,
} from "../models/reviewState";
import { DEFAULT_SETTINGS, MnemeSettings, normalizeSettings } from "../models/settings";
import { SourceAnalysisRecord } from "../models/sourceAnalysis";
import type { ManualConceptDraft } from "../models/manualConceptDraft";
import type { ManualCardDraft } from "../models/manualCardDraft";
import { CARD_DRAFT_TYPES } from "../models/knowledgeProposal";
import {
	ConceptSourceLink,
	ConceptSourceRelationType,
	ConceptSourceLinkStatus,
} from "../models/conceptSource";
import {
	KNOWLEDGE_PROPOSAL_KINDS,
	KNOWLEDGE_PROPOSAL_STATUSES,
	KnowledgeProposal,
	KnowledgeProposalKind,
	KnowledgeProposalStatus,
} from "../models/knowledgeProposal";
import { createConceptDuplicatePairKey } from "./conceptDuplicateDetector";
import { withDeletedConceptState } from "./conceptDeletionState";
import { runPluginDataMutation } from "./pluginDataMutation";
import type { ConceptConflictMergeDraftRecord } from "../models/conceptConflictMergeDraft";

const CURRENT_SCHEMA_VERSION = 1;

export interface ReviewStateStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ReviewStateStore {
	private data: MnemePluginData = createDefaultPluginData();
	private isLoaded = false;
	private pendingSettings?: MnemeSettings;

	constructor(
		private readonly storage: ReviewStateStorage,
		private readonly scheduler: ReviewScheduler,
	) {
	}

	async load(): Promise<void> {
		this.data = normalizePluginData(await this.storage.loadData());
		this.isLoaded = true;
	}

	getState(cardId: string): CardReviewState | undefined {
		return this.data.reviewStates[cardId];
	}

	async recordReview(
		cardId: string,
		rating: ReviewRating,
		options: { requestRetention?: number } = {},
	): Promise<CardReviewState> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			if (latestData.cardTombstones[cardId]) {
				throw new Error("Deleted Card IDs cannot receive reviews.");
			}
			const reviewedAt = new Date().toISOString();
			const scheduleResult = this.scheduler.schedule({
				cardId,
				previousState: latestData.reviewStates[cardId],
				rating,
				requestRetention: options.requestRetention,
				reviewedAt,
			});
			const reviewEvent: CardReviewEvent = {
				cardId,
				eventId: createReviewEventId(cardId, reviewedAt, scheduleResult.nextState.reviewCount),
				rating,
				reviewedAt,
			};
			const nextData = {
				...latestData,
				reviewEvents: {
					...latestData.reviewEvents,
					[reviewEvent.eventId]: reviewEvent,
				},
				reviewDeferrals: omitKey(latestData.reviewDeferrals, cardId),
				suspendedCards: omitKey(latestData.suspendedCards, cardId),
				reviewStates: {
					...latestData.reviewStates,
					[cardId]: scheduleResult.nextState,
				},
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return scheduleResult.nextState;
		});
	}

	getAllStates(): Record<string, CardReviewState> {
		return { ...this.data.reviewStates };
	}

	getReviewEvents(): CardReviewEvent[] {
		return Object.values(this.data.reviewEvents).map((event) => ({ ...event }));
	}

	getCardTombstones(): Record<string, CardTombstone> {
		const tombstones: Record<string, CardTombstone> = {};

		for (const [cardId, tombstone] of Object.entries(this.data.cardTombstones)) {
			tombstones[cardId] = { ...tombstone };
		}

		return tombstones;
	}

	getConceptDuplicateDismissals(): Record<string, ConceptDuplicateDismissal> {
		const dismissals: Record<string, ConceptDuplicateDismissal> = {};
		for (const [pairKey, dismissal] of Object.entries(this.data.conceptDuplicateDismissals)) {
			dismissals[pairKey] = { ...dismissal, conceptIds: [...dismissal.conceptIds] };
		}
		return dismissals;
	}

	getConceptMergeRecords(): Record<string, ConceptMergeRecord> {
		const records: Record<string, ConceptMergeRecord> = {};
		for (const [conceptId, record] of Object.entries(this.data.conceptMergeRecords)) {
			records[conceptId] = { ...record };
		}
		return records;
	}

	async dismissConceptDuplicate(
		firstConceptId: string,
		secondConceptId: string,
		now = new Date(),
	): Promise<ConceptDuplicateDismissal> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const pairKey = createConceptDuplicatePairKey(firstConceptId, secondConceptId);
			if (!firstConceptId.trim() || !secondConceptId.trim() || firstConceptId === secondConceptId || Number.isNaN(now.getTime())) {
				throw new Error("Duplicate dismissal requires two different Concept IDs and a valid time.");
			}
			const dismissal: ConceptDuplicateDismissal = {
				conceptIds: [firstConceptId, secondConceptId].sort() as [string, string],
				dismissedAt: now.toISOString(),
				pairKey,
			};
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			const nextData = {
				...latestData,
				conceptDuplicateDismissals: {
					...latestData.conceptDuplicateDismissals,
					[pairKey]: dismissal,
				},
			};
			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
			return dismissal;
		});
	}

	async reconsiderConceptDuplicate(pairKey: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			const nextData = {
				...latestData,
				conceptDuplicateDismissals: omitKey(latestData.conceptDuplicateDismissals, pairKey),
			};
			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async deleteCard(cardId: string, now = new Date()): Promise<CardTombstone> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			if (!cardId.trim() || Number.isNaN(now.getTime())) {
				throw new Error("Card deletion requires a Card id and valid time.");
			}

			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			if (latestData.cardTombstones[cardId]) {
				throw new Error("This Card ID is already deleted.");
			}

			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			const nextData = withDeletedCardState(latestData, cardId, now.toISOString());
			const tombstone = nextData.cardTombstones[cardId]!;

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
			return tombstone;
		});
	}

	repairConceptId(issue: ConceptIdentityIssue, newId: string, vault: ConceptIdRepairVault): Promise<void> {
		return new RecoverableConceptIdRepair(vault, this.storage).repair(issue, newId);
	}

	resumeConceptIdRepair(vault: ConceptIdRepairVault): Promise<boolean> {
		return new RecoverableConceptIdRepair(vault, this.storage).resume();
	}

	repairCardId(card: CardIdRepairInput, newCardId: string, vault: CardIdRepairVault): Promise<void> {
		return new RecoverableCardIdRepair(vault, this.storage).repair(card, newCardId);
	}

	resumeCardIdRepair(vault: CardIdRepairVault): Promise<boolean> {
		return new RecoverableCardIdRepair(vault, this.storage).resume();
	}

	deleteCardFromMarkdown(card: CardDeletionInput, vault: CardDeletionVault): Promise<void> {
		return new RecoverableCardDeletion(vault, this.storage).delete(card);
	}

	resumeCardDeletion(vault: CardDeletionVault): Promise<boolean> {
		return new RecoverableCardDeletion(vault, this.storage).resume();
	}

	async deleteConcept(conceptId: string, cardIds: string[], now = new Date()): Promise<CardTombstone[]> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			if (!conceptId.trim() || Number.isNaN(now.getTime())) {
				throw new Error("Concept deletion requires a Concept id and valid time.");
			}

			const uniqueCardIds = [...new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean))];
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertConceptIdRepairAllowsConcept(latestData.conceptIdRepairs, conceptId);
			for (const cardId of uniqueCardIds) assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			const deletedAt = now.toISOString();
			const nextData = withDeletedConceptState(latestData, conceptId, cardIds, deletedAt);

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
			return uniqueCardIds
				.map((cardId) => nextData.cardTombstones[cardId])
				.filter((tombstone): tombstone is CardTombstone => tombstone !== undefined);
		});
	}

	async eraseDeletedCardHistory(cardId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			if (!latestData.cardTombstones[cardId]) {
				throw new Error("Card tombstone not found.");
			}

			const nextData = {
				...latestData,
				cardTombstones: omitKey(latestData.cardTombstones, cardId),
				reviewEvents: Object.fromEntries(
					Object.entries(latestData.reviewEvents).filter(([, event]) => event.cardId !== cardId),
				),
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	getReviewStateCount(): number {
		return Object.keys(this.data.reviewStates).length;
	}

	getActiveReviewDeferrals(now = new Date()): Record<string, ReviewDeferral> {
		const active: Record<string, ReviewDeferral> = {};

		for (const [cardId, deferral] of Object.entries(this.data.reviewDeferrals)) {
			if (Date.parse(deferral.resumeAt) > now.getTime()) {
				active[cardId] = { ...deferral };
			}
		}

		return active;
	}

	getPausedConcepts(): Record<string, ConceptReviewPause> {
		const pauses: Record<string, ConceptReviewPause> = {};

		for (const [conceptId, pause] of Object.entries(this.data.pausedConcepts)) {
			pauses[conceptId] = { ...pause };
		}

		return pauses;
	}

	getSuspendedCards(): Record<string, CardReviewSuspension> {
		const suspensions: Record<string, CardReviewSuspension> = {};

		for (const [cardId, suspension] of Object.entries(this.data.suspendedCards)) {
			suspensions[cardId] = { ...suspension };
		}

		return suspensions;
	}

	getRetiredCards(): Record<string, CardRetirement> {
		const retirements: Record<string, CardRetirement> = {};

		for (const [cardId, retirement] of Object.entries(this.data.retiredCards)) {
			retirements[cardId] = { ...retirement };
		}

		return retirements;
	}

	async retireCard(cardId: string, now = new Date()): Promise<CardRetirement> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!cardId.trim() || Number.isNaN(now.getTime())) {
				throw new Error("Card retirement requires a Card id and valid time.");
			}

			const retirement: CardRetirement = {
				cardId,
				retiredAt: now.toISOString(),
			};
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			if (latestData.cardTombstones[cardId]) throw new Error("Deleted Card IDs cannot receive review controls.");
			const nextData = {
				...latestData,
				retiredCards: {
					...latestData.retiredCards,
					[cardId]: retirement,
				},
				reviewDeferrals: omitKey(latestData.reviewDeferrals, cardId),
				suspendedCards: omitKey(latestData.suspendedCards, cardId),
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return retirement;
		});
	}

	async restoreRetiredCard(cardId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			const nextData = {
				...latestData,
				retiredCards: omitKey(latestData.retiredCards, cardId),
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async suspendCard(cardId: string, now = new Date()): Promise<CardReviewSuspension> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!cardId.trim() || Number.isNaN(now.getTime())) {
				throw new Error("Card suspension requires a Card id and valid time.");
			}

			const suspension: CardReviewSuspension = {
				cardId,
				suspendedAt: now.toISOString(),
			};
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			if (latestData.cardTombstones[cardId]) throw new Error("Deleted Card IDs cannot receive review controls.");
			const nextData = {
				...latestData,
				reviewDeferrals: omitKey(latestData.reviewDeferrals, cardId),
				suspendedCards: {
					...latestData.suspendedCards,
					[cardId]: suspension,
				},
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return suspension;
		});
	}

	async resumeCard(cardId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			const nextData = {
				...latestData,
				suspendedCards: omitKey(latestData.suspendedCards, cardId),
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async rekeyCard(oldCardId: string, newCardId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!oldCardId.trim() || !newCardId.trim() || oldCardId === newCardId) {
				throw new Error("Card ID migration requires two different non-empty IDs.");
			}

			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, oldCardId);
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, newCardId);
			const nextData = withRekeyedCardState(latestData, oldCardId, newCardId);

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async pauseConcept(conceptId: string, now = new Date()): Promise<ConceptReviewPause> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!conceptId.trim() || Number.isNaN(now.getTime())) {
				throw new Error("Concept pause requires a Concept id and valid time.");
			}

			const pause: ConceptReviewPause = {
				conceptId,
				pausedAt: now.toISOString(),
			};
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertConceptIdRepairAllowsConcept(latestData.conceptIdRepairs, conceptId);
			const nextData = {
				...latestData,
				pausedConcepts: {
					...latestData.pausedConcepts,
					[conceptId]: pause,
				},
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return pause;
		});
	}

	async rekeyConcept(oldConceptId: string, newConceptId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!oldConceptId.trim() || !newConceptId.trim() || oldConceptId === newConceptId) {
				throw new Error("Concept ID migration requires two different non-empty IDs.");
			}

			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertConceptIdRepairAllowsConcept(latestData.conceptIdRepairs, oldConceptId);
			assertConceptIdRepairAllowsConcept(latestData.conceptIdRepairs, newConceptId);
			const nextData = withRekeyedConceptPause(latestData, oldConceptId, newConceptId);

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async resumeConcept(conceptId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertConceptIdRepairAllowsConcept(latestData.conceptIdRepairs, conceptId);
			const nextData = {
				...latestData,
				pausedConcepts: omitKey(latestData.pausedConcepts, conceptId),
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	async clearConceptPauses(): Promise<number> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			if (Object.values(readConceptIdRepairs(latestData.conceptIdRepairs)).some((r) => r.status === "pending")) {
				throw new Error("Run Resume Concept ID Repair before clearing legacy Concept pauses.");
			}
			const pausedCount = Object.keys(latestData.pausedConcepts).length;

			if (pausedCount === 0) {
				return 0;
			}

			const nextData = {
				...latestData,
				pausedConcepts: {},
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return pausedCount;
		});
	}

	async deferReviewUntil(cardId: string, resumeAt: Date, now = new Date()): Promise<ReviewDeferral> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();

			if (!cardId.trim() || Number.isNaN(resumeAt.getTime()) || resumeAt.getTime() <= now.getTime()) {
				throw new Error("Review deferral requires a Card id and a future resume time.");
			}

			const deferral: ReviewDeferral = {
				cardId,
				deferredAt: now.toISOString(),
				resumeAt: resumeAt.toISOString(),
			};
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			assertCardIdRepairAllowsCard(latestData.cardIdRepairs, cardId);
			assertCardDeletionAllowsCard(latestData.cardDeletion, cardId);
			assertCardNotDeleting(latestData.conceptDeletions, cardId);
			if (latestData.cardTombstones[cardId]) throw new Error("Deleted Card IDs cannot receive review controls.");
			const nextData = {
				...latestData,
				reviewDeferrals: {
					...latestData.reviewDeferrals,
					[cardId]: deferral,
				},
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;

			return deferral;
		});
	}

	setSettings(settings: MnemeSettings): void {
		const normalizedSettings = normalizeSettings(settings);

		this.data = {
			...this.data,
			settings: normalizedSettings,
		};
		this.pendingSettings = normalizedSettings;
	}

	async clearReviewStates(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			await this.ensureLoaded();
			const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
			const nextData = {
				...latestData,
				cardTombstones: Object.fromEntries(Object.entries(latestData.cardTombstones).map(([cardId, tombstone]) => [
					cardId,
					{ ...tombstone, lapseCount: 0, reviewCount: 0 },
				])),
				reviewDeferrals: {},
				reviewEvents: {},
				reviewStates: {},
				schemaVersion: latestData.schemaVersion,
			};

			await this.storage.saveData(nextData);
			this.data = nextData;
			this.pendingSettings = undefined;
		});
	}

	private async ensureLoaded(): Promise<void> {
		if (this.isLoaded) {
			return;
		}

		await this.load();
	}

	private mergePendingSettings(data: MnemePluginData): MnemePluginData {
		return this.pendingSettings
			? { ...data, settings: this.pendingSettings }
			: data;
	}
}

export function createDefaultPluginData(): MnemePluginData {
	return {
		cardTombstones: {},
		conceptConflictMergeDrafts: {},
		conceptDuplicateDismissals: {},
		conceptMergeRecords: {},
		conceptSourceLinks: {},
		knowledgeProposals: {},
		pausedConcepts: {},
		reviewEvents: {},
		retiredCards: {},
		reviewStates: {},
		reviewDeferrals: {},
		suspendedCards: {},
		schemaVersion: CURRENT_SCHEMA_VERSION,
		settings: { ...DEFAULT_SETTINGS },
		sourceAnalysisRecords: {},
	};
}

export function normalizePluginData(data: unknown): MnemePluginData {
	if (!isObject(data)) {
		return createDefaultPluginData();
	}

	const reviewStates = isObject(data.reviewStates)
		? data.reviewStates
		: {};
	const cardTombstones = isObject(data.cardTombstones)
		? data.cardTombstones
		: {};
	const conceptDuplicateDismissals = isObject(data.conceptDuplicateDismissals)
		? data.conceptDuplicateDismissals
		: {};
	const conceptConflictMergeDrafts = isObject(data.conceptConflictMergeDrafts)
		? data.conceptConflictMergeDrafts
		: {};
	const conceptMergeRecords = isObject(data.conceptMergeRecords)
		? data.conceptMergeRecords
		: {};
	const reviewEvents = isObject(data.reviewEvents)
		? data.reviewEvents
		: {};
	const pausedConcepts = isObject(data.pausedConcepts)
		? data.pausedConcepts
		: {};
	const reviewDeferrals = isObject(data.reviewDeferrals)
		? data.reviewDeferrals
		: {};
	const retiredCards = isObject(data.retiredCards)
		? data.retiredCards
		: {};
	const suspendedCards = isObject(data.suspendedCards)
		? data.suspendedCards
		: {};
	const sourceAnalysisRecords = isObject(data.sourceAnalysisRecords)
		? data.sourceAnalysisRecords
		: {};
	const knowledgeProposals = isObject(data.knowledgeProposals)
		? data.knowledgeProposals
		: {};
	const conceptSourceLinks = isObject(data.conceptSourceLinks)
		? data.conceptSourceLinks
		: {};

	return {
		...data,
		cardTombstones: normalizeCardTombstones(cardTombstones),
		conceptConflictMergeDrafts: normalizeConceptConflictMergeDrafts(conceptConflictMergeDrafts),
		conceptDuplicateDismissals: normalizeConceptDuplicateDismissals(conceptDuplicateDismissals),
		conceptMergeRecords: normalizeConceptMergeRecords(conceptMergeRecords),
		conceptSourceLinks: normalizeConceptSourceLinks(conceptSourceLinks),
		knowledgeProposals: normalizeKnowledgeProposals(knowledgeProposals),
		manualCardDraft: normalizeManualCardDraft(data.manualCardDraft),
		manualConceptDraft: normalizeManualConceptDraft(data.manualConceptDraft),
		pausedConcepts: normalizePausedConcepts(pausedConcepts),
		reviewEvents: normalizeReviewEvents(reviewEvents),
		reviewStates: normalizeReviewStates(reviewStates),
		reviewDeferrals: normalizeReviewDeferrals(reviewDeferrals),
		retiredCards: normalizeRetiredCards(retiredCards),
		suspendedCards: normalizeSuspendedCards(suspendedCards),
		schemaVersion: CURRENT_SCHEMA_VERSION,
		settings: normalizeSettings(data.settings),
		sourceAnalysisRecords: normalizeSourceAnalysisRecords(sourceAnalysisRecords),
	};
}

function normalizeConceptConflictMergeDrafts(
	records: Record<string, unknown>,
): Record<string, ConceptConflictMergeDraftRecord> {
	const normalized: Record<string, ConceptConflictMergeDraftRecord> = {};

	for (const [key, record] of Object.entries(records)) {
		if (
			!isObject(record)
			|| record.key !== key
			|| typeof record.existingConceptId !== "string"
			|| !record.existingConceptId.trim()
			|| typeof record.incomingFingerprint !== "string"
			|| !record.incomingFingerprint.trim()
			|| typeof record.updatedAt !== "string"
			|| Number.isNaN(Date.parse(record.updatedAt))
			|| !isObject(record.draft)
			|| typeof record.draft.title !== "string"
			|| typeof record.draft.englishName !== "string"
			|| typeof record.draft.coreMeaning !== "string"
			|| typeof record.draft.whyItMatters !== "string"
			|| (record.draft.learningMode !== "reviewable" && record.draft.learningMode !== "exploratory")
			|| (
				record.draft.importance !== "low"
				&& record.draft.importance !== "normal"
				&& record.draft.importance !== "high"
				&& record.draft.importance !== "critical"
			)
			|| !Array.isArray(record.draft.tags)
			|| !record.draft.tags.every((tag) => typeof tag === "string")
		) {
			continue;
		}

		normalized[key] = {
			draft: {
				coreMeaning: record.draft.coreMeaning,
				englishName: record.draft.englishName,
				importance: record.draft.importance,
				learningMode: record.draft.learningMode,
				tags: [...record.draft.tags],
				title: record.draft.title,
				whyItMatters: record.draft.whyItMatters,
			},
			existingConceptId: record.existingConceptId,
			incomingFingerprint: record.incomingFingerprint,
			key,
			updatedAt: record.updatedAt,
		};
	}

	return normalized;
}

function normalizeManualCardDraft(value: unknown): ManualCardDraft | undefined {
	if (
		!isObject(value)
		|| (value.conceptId !== undefined && typeof value.conceptId !== "string")
		|| typeof value.cardType !== "string"
		|| !CARD_DRAFT_TYPES.some((cardType) => cardType === value.cardType)
		|| typeof value.front !== "string"
		|| typeof value.back !== "string"
		|| typeof value.rubric !== "string"
		|| typeof value.updatedAt !== "string"
		|| Number.isNaN(Date.parse(value.updatedAt))
	) {
		return undefined;
	}

	return {
		// Keep invalid identity metadata visible so Composer can block unsafe recovery.
		...(value.draftId !== undefined ? { draftId: value.draftId as string } : {}),
		back: value.back,
		cardType: value.cardType as ManualCardDraft["cardType"],
		...(value.conceptId ? { conceptId: value.conceptId } : {}),
		front: value.front,
		rubric: value.rubric,
		updatedAt: value.updatedAt,
	};
}

function normalizeManualConceptDraft(value: unknown): ManualConceptDraft | undefined {
	if (
		!isObject(value)
		|| typeof value.title !== "string"
		|| (value.englishName !== undefined && typeof value.englishName !== "string")
		|| typeof value.coreMeaning !== "string"
		|| typeof value.whyItMatters !== "string"
		|| (value.learningMode !== "reviewable" && value.learningMode !== "exploratory")
		|| (value.importance !== "low" && value.importance !== "normal" && value.importance !== "high" && value.importance !== "critical")
		|| !Array.isArray(value.tags)
		|| !value.tags.every((tag) => typeof tag === "string")
		|| (value.sourcePath !== undefined && typeof value.sourcePath !== "string")
		|| typeof value.updatedAt !== "string"
		|| Number.isNaN(Date.parse(value.updatedAt))
	) {
		return undefined;
	}

	return {
		...(value.draftId !== undefined ? { draftId: value.draftId as string } : {}),
		coreMeaning: value.coreMeaning,
		englishName: typeof value.englishName === "string" ? value.englishName : "",
		importance: value.importance,
		learningMode: value.learningMode,
		...(value.sourcePath?.trim() ? { sourcePath: value.sourcePath } : {}),
		tags: [...value.tags],
		title: value.title,
		updatedAt: value.updatedAt,
		whyItMatters: value.whyItMatters,
	};
}

function normalizeConceptMergeRecords(records: Record<string, unknown>): Record<string, ConceptMergeRecord> {
	const normalized: Record<string, ConceptMergeRecord> = {};
	for (const record of Object.values(records)) {
		if (
			isObject(record)
			&& typeof record.mergedAt === "string"
			&& !Number.isNaN(Date.parse(record.mergedAt))
			&& typeof record.mergedConceptId === "string"
			&& !!record.mergedConceptId.trim()
			&& typeof record.mergedPath === "string"
			&& !!record.mergedPath.trim()
			&& typeof record.survivorConceptId === "string"
			&& !!record.survivorConceptId.trim()
			&& record.mergedConceptId !== record.survivorConceptId
			&& typeof record.survivorPath === "string"
			&& !!record.survivorPath.trim()
		) {
			normalized[record.mergedConceptId] = {
				mergedAt: record.mergedAt,
				mergedConceptId: record.mergedConceptId,
				mergedPath: record.mergedPath,
				survivorConceptId: record.survivorConceptId,
				survivorPath: record.survivorPath,
			};
		}
	}
	return normalized;
}

function normalizeConceptDuplicateDismissals(
	dismissals: Record<string, unknown>,
): Record<string, ConceptDuplicateDismissal> {
	const normalized: Record<string, ConceptDuplicateDismissal> = {};
	for (const dismissal of Object.values(dismissals)) {
		if (
			isObject(dismissal)
			&& Array.isArray(dismissal.conceptIds)
			&& dismissal.conceptIds.length === 2
			&& dismissal.conceptIds.every((conceptId) => typeof conceptId === "string" && conceptId.trim())
			&& dismissal.conceptIds[0] !== dismissal.conceptIds[1]
			&& typeof dismissal.dismissedAt === "string"
			&& !Number.isNaN(Date.parse(dismissal.dismissedAt))
			&& typeof dismissal.pairKey === "string"
			&& dismissal.pairKey === createConceptDuplicatePairKey(dismissal.conceptIds[0], dismissal.conceptIds[1])
		) {
			normalized[dismissal.pairKey] = {
				conceptIds: [...dismissal.conceptIds].sort() as [string, string],
				dismissedAt: dismissal.dismissedAt,
				pairKey: dismissal.pairKey,
			};
		}
	}
	return normalized;
}

function normalizeCardTombstones(tombstones: Record<string, unknown>): Record<string, CardTombstone> {
	const normalized: Record<string, CardTombstone> = {};
	for (const tombstone of Object.values(tombstones)) {
		if (
			isObject(tombstone)
			&& typeof tombstone.cardId === "string"
			&& typeof tombstone.deletedAt === "string"
			&& !Number.isNaN(Date.parse(tombstone.deletedAt))
			&& isNonNegativeInteger(tombstone.lapseCount)
			&& isNonNegativeInteger(tombstone.reviewCount)
		) {
			normalized[tombstone.cardId] = {
				cardId: tombstone.cardId,
				deletedAt: tombstone.deletedAt,
				lapseCount: tombstone.lapseCount,
				reviewCount: tombstone.reviewCount,
			};
		}
	}
	return normalized;
}

function normalizeReviewEvents(events: Record<string, unknown>): Record<string, CardReviewEvent> {
	const normalized: Record<string, CardReviewEvent> = {};
	for (const event of Object.values(events)) {
		if (
			isObject(event)
			&& typeof event.cardId === "string"
			&& typeof event.eventId === "string"
			&& (event.rating === "again" || event.rating === "hard" || event.rating === "good" || event.rating === "easy")
			&& typeof event.reviewedAt === "string"
			&& !Number.isNaN(Date.parse(event.reviewedAt))
		) {
			normalized[event.eventId] = {
				cardId: event.cardId,
				eventId: event.eventId,
				rating: event.rating,
				reviewedAt: event.reviewedAt,
			};
		}
	}
	return normalized;
}

function normalizeRetiredCards(retirements: Record<string, unknown>): Record<string, CardRetirement> {
	const normalized: Record<string, CardRetirement> = {};

	for (const retirement of Object.values(retirements)) {
		if (
			isObject(retirement)
			&& typeof retirement.cardId === "string"
			&& typeof retirement.retiredAt === "string"
			&& !Number.isNaN(Date.parse(retirement.retiredAt))
		) {
			normalized[retirement.cardId] = {
				cardId: retirement.cardId,
				retiredAt: retirement.retiredAt,
			};
		}
	}

	return normalized;
}

function normalizeSuspendedCards(suspensions: Record<string, unknown>): Record<string, CardReviewSuspension> {
	const normalized: Record<string, CardReviewSuspension> = {};

	for (const suspension of Object.values(suspensions)) {
		if (
			isObject(suspension)
			&& typeof suspension.cardId === "string"
			&& typeof suspension.suspendedAt === "string"
			&& !Number.isNaN(Date.parse(suspension.suspendedAt))
		) {
			normalized[suspension.cardId] = {
				cardId: suspension.cardId,
				suspendedAt: suspension.suspendedAt,
			};
		}
	}

	return normalized;
}

function normalizePausedConcepts(pauses: Record<string, unknown>): Record<string, ConceptReviewPause> {
	const normalized: Record<string, ConceptReviewPause> = {};

	for (const pause of Object.values(pauses)) {
		if (
			isObject(pause)
			&& typeof pause.conceptId === "string"
			&& typeof pause.pausedAt === "string"
			&& !Number.isNaN(Date.parse(pause.pausedAt))
		) {
			normalized[pause.conceptId] = {
				conceptId: pause.conceptId,
				pausedAt: pause.pausedAt,
			};
		}
	}

	return normalized;
}

function normalizeReviewDeferrals(deferrals: Record<string, unknown>): Record<string, ReviewDeferral> {
	const normalized: Record<string, ReviewDeferral> = {};

	for (const deferral of Object.values(deferrals)) {
		if (
			isObject(deferral)
			&& typeof deferral.cardId === "string"
			&& typeof deferral.deferredAt === "string"
			&& typeof deferral.resumeAt === "string"
			&& !Number.isNaN(Date.parse(deferral.deferredAt))
			&& !Number.isNaN(Date.parse(deferral.resumeAt))
		) {
			normalized[deferral.cardId] = {
				cardId: deferral.cardId,
				deferredAt: deferral.deferredAt,
				resumeAt: deferral.resumeAt,
			};
		}
	}

	return normalized;
}

function normalizeReviewStates(states: Record<string, unknown>): Record<string, CardReviewState> {
	const normalizedStates: Record<string, CardReviewState> = {};

	for (const [cardId, state] of Object.entries(states)) {
		if (!isCardReviewState(state)) {
			continue;
		}

		normalizedStates[cardId] = state;
	}

	return normalizedStates;
}

function isCardReviewState(value: unknown): value is CardReviewState {
	return isObject(value)
		&& typeof value.cardId === "string"
		&& typeof value.createdAt === "string"
		&& typeof value.updatedAt === "string"
		&& typeof value.reviewCount === "number"
		&& typeof value.lapseCount === "number";
}

function normalizeSourceAnalysisRecords(states: Record<string, unknown>): Record<string, SourceAnalysisRecord> {
	const normalizedRecords: Record<string, SourceAnalysisRecord> = {};

	for (const [sourcePath, record] of Object.entries(states)) {
		if (!isSourceAnalysisRecord(record)) {
			continue;
		}

		normalizedRecords[sourcePath] = record;
	}

	return normalizedRecords;
}

function isSourceAnalysisRecord(value: unknown): value is SourceAnalysisRecord {
	return isObject(value)
		&& typeof value.sourcePath === "string"
		&& typeof value.contentHash === "string"
		&& (value.lastAiCaptureAnalyzedChars === undefined || isNonNegativeInteger(value.lastAiCaptureAnalyzedChars))
		&& (value.lastAiCaptureChunkCount === undefined || isNonNegativeInteger(value.lastAiCaptureChunkCount))
		&& (value.lastAiCaptureFingerprint === undefined || typeof value.lastAiCaptureFingerprint === "string")
		&& (value.lastAiCaptureTotalChars === undefined || isNonNegativeInteger(value.lastAiCaptureTotalChars))
		&& (value.lastCardGenerationFingerprint === undefined || typeof value.lastCardGenerationFingerprint === "string")
		&& (value.lastCardGenerationOutcome === undefined
			|| value.lastCardGenerationOutcome === "proposed"
			|| value.lastCardGenerationOutcome === "coverage_complete")
		&& (value.lastCardGenerationHash === undefined || typeof value.lastCardGenerationHash === "string")
		&& typeof value.mtime === "number"
		&& typeof value.size === "number"
		&& typeof value.lastAnalyzedAt === "string"
		&& Array.isArray(value.linkedConceptIds)
		&& value.linkedConceptIds.every((conceptId) => typeof conceptId === "string")
		&& Array.isArray(value.pendingProposalIds)
		&& value.pendingProposalIds.every((proposalId) => typeof proposalId === "string")
		&& isSourceAnalysisStatus(value.status);
}

function isSourceAnalysisStatus(value: unknown): value is SourceAnalysisRecord["status"] {
	return value === "clean"
		|| value === "stale"
		|| value === "analyzing"
		|| value === "failed";
}

function normalizeKnowledgeProposals(states: Record<string, unknown>): Record<string, KnowledgeProposal> {
	const normalizedProposals: Record<string, KnowledgeProposal> = {};

	for (const proposal of Object.values(states)) {
		if (!isKnowledgeProposal(proposal)) {
			continue;
		}

		normalizedProposals[proposal.id] = proposal;
	}

	return normalizedProposals;
}

function isKnowledgeProposal(value: unknown): value is KnowledgeProposal {
	return isObject(value)
		&& typeof value.id === "string"
		&& isKnowledgeProposalKind(value.kind)
		&& isKnowledgeProposalStatus(value.status)
		&& typeof value.createdAt === "string"
		&& typeof value.updatedAt === "string"
		&& (value.sourcePath === undefined || typeof value.sourcePath === "string")
		&& (value.sourceHash === undefined || typeof value.sourceHash === "string")
		&& (value.conceptId === undefined || typeof value.conceptId === "string")
		&& (value.cardId === undefined || typeof value.cardId === "string");
}

function isKnowledgeProposalKind(value: unknown): value is KnowledgeProposalKind {
	return typeof value === "string"
		&& (KNOWLEDGE_PROPOSAL_KINDS as readonly string[]).includes(value);
}

function isKnowledgeProposalStatus(value: unknown): value is KnowledgeProposalStatus {
	return typeof value === "string"
		&& (KNOWLEDGE_PROPOSAL_STATUSES as readonly string[]).includes(value);
}

function normalizeConceptSourceLinks(states: Record<string, unknown>): Record<string, ConceptSourceLink> {
	const normalizedLinks: Record<string, ConceptSourceLink> = {};

	for (const link of Object.values(states)) {
		if (!isConceptSourceLink(link)) {
			continue;
		}

		normalizedLinks[link.id] = link;
	}

	return normalizedLinks;
}

function isConceptSourceLink(value: unknown): value is ConceptSourceLink {
	return isObject(value)
		&& typeof value.id === "string"
		&& typeof value.conceptId === "string"
		&& typeof value.sourcePath === "string"
		&& typeof value.sourceHash === "string"
		&& isConceptSourceRelationType(value.relationType)
		&& Array.isArray(value.evidence)
		&& value.evidence.every(isSourceEvidence)
		&& isConceptSourceLinkStatus(value.status)
		&& typeof value.addedAt === "string"
		&& typeof value.lastSeenAt === "string";
}

function isSourceEvidence(value: unknown): boolean {
	return isObject(value)
		&& typeof value.excerpt === "string"
		&& (value.heading === undefined || typeof value.heading === "string")
		&& (value.blockId === undefined || typeof value.blockId === "string")
		&& (value.lineStart === undefined || typeof value.lineStart === "number")
		&& (value.lineEnd === undefined || typeof value.lineEnd === "number");
}

function isConceptSourceRelationType(value: unknown): value is ConceptSourceRelationType {
	return value === "origin"
		|| value === "supporting"
		|| value === "example"
		|| value === "application"
		|| value === "contrast"
		|| value === "exam"
		|| value === "project"
		|| value === "update";
}

function isConceptSourceLinkStatus(value: unknown): value is ConceptSourceLinkStatus {
	return value === "suggested"
		|| value === "approved"
		|| value === "rejected"
		|| value === "stale";
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function createReviewEventId(cardId: string, reviewedAt: string, reviewCount: number): string {
	return `${cardId}:${reviewedAt}:${reviewCount}`;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const result = { ...record };

	delete result[key];

	return result;
}

export function startOfNextLocalDay(now: Date): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}
