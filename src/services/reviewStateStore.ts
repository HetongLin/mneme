import { ReviewScheduler } from "../models/reviewScheduler";
import {
	CardReviewState,
	CardReviewSuspension,
	CardRetirement,
	CardReviewEvent,
	CardTombstone,
	ConceptDuplicateDismissal,
	ConceptReviewPause,
	MnemePluginData,
	ReviewDeferral,
	ReviewRating,
} from "../models/reviewState";
import { DEFAULT_SETTINGS, MnemeSettings, normalizeSettings } from "../models/settings";
import { SourceAnalysisRecord } from "../models/sourceAnalysis";
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

	async recordReview(cardId: string, rating: ReviewRating): Promise<CardReviewState> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		if (latestData.cardTombstones[cardId]) {
			throw new Error("Deleted Card IDs cannot receive reviews.");
		}
		const reviewedAt = new Date().toISOString();
		const scheduleResult = this.scheduler.schedule({
			cardId,
			previousState: latestData.reviewStates[cardId],
			rating,
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

	async dismissConceptDuplicate(
		firstConceptId: string,
		secondConceptId: string,
		now = new Date(),
	): Promise<ConceptDuplicateDismissal> {
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
	}

	async reconsiderConceptDuplicate(pairKey: string): Promise<void> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		const nextData = {
			...latestData,
			conceptDuplicateDismissals: omitKey(latestData.conceptDuplicateDismissals, pairKey),
		};
		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async deleteCard(cardId: string, now = new Date()): Promise<CardTombstone> {
		await this.ensureLoaded();
		if (!cardId.trim() || Number.isNaN(now.getTime())) {
			throw new Error("Card deletion requires a Card id and valid time.");
		}

		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		if (latestData.cardTombstones[cardId]) {
			throw new Error("This Card ID is already deleted.");
		}

		const reviewState = latestData.reviewStates[cardId];
		const tombstone: CardTombstone = {
			cardId,
			deletedAt: now.toISOString(),
			lapseCount: reviewState?.lapseCount ?? 0,
			reviewCount: reviewState?.reviewCount ?? 0,
		};
		const nextData = {
			...latestData,
			cardTombstones: {
				...latestData.cardTombstones,
				[cardId]: tombstone,
			},
			retiredCards: omitKey(latestData.retiredCards, cardId),
			reviewDeferrals: omitKey(latestData.reviewDeferrals, cardId),
			reviewStates: omitKey(latestData.reviewStates, cardId),
			suspendedCards: omitKey(latestData.suspendedCards, cardId),
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
		return tombstone;
	}

	async eraseDeletedCardHistory(cardId: string): Promise<void> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
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
		await this.ensureLoaded();

		if (!cardId.trim() || Number.isNaN(now.getTime())) {
			throw new Error("Card retirement requires a Card id and valid time.");
		}

		const retirement: CardRetirement = {
			cardId,
			retiredAt: now.toISOString(),
		};
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
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
	}

	async restoreRetiredCard(cardId: string): Promise<void> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		const nextData = {
			...latestData,
			retiredCards: omitKey(latestData.retiredCards, cardId),
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async suspendCard(cardId: string, now = new Date()): Promise<CardReviewSuspension> {
		await this.ensureLoaded();

		if (!cardId.trim() || Number.isNaN(now.getTime())) {
			throw new Error("Card suspension requires a Card id and valid time.");
		}

		const suspension: CardReviewSuspension = {
			cardId,
			suspendedAt: now.toISOString(),
		};
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
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
	}

	async resumeCard(cardId: string): Promise<void> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		const nextData = {
			...latestData,
			suspendedCards: omitKey(latestData.suspendedCards, cardId),
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async rekeyCard(oldCardId: string, newCardId: string): Promise<void> {
		await this.ensureLoaded();

		if (!oldCardId.trim() || !newCardId.trim() || oldCardId === newCardId) {
			throw new Error("Card ID migration requires two different non-empty IDs.");
		}

		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		if (
			latestData.cardTombstones[newCardId]
			|| latestData.reviewStates[newCardId]
			|| latestData.reviewDeferrals[newCardId]
			|| latestData.retiredCards[newCardId]
			|| latestData.suspendedCards[newCardId]
		) {
			throw new Error("The new Card ID already has review state.");
		}

		const reviewState = latestData.reviewStates[oldCardId];
		const deferral = latestData.reviewDeferrals[oldCardId];
		const retirement = latestData.retiredCards[oldCardId];
		const suspension = latestData.suspendedCards[oldCardId];
		const nextData = {
			...latestData,
			reviewEvents: Object.fromEntries(Object.entries(latestData.reviewEvents).map(([eventId, event]) => [
				eventId,
				event.cardId === oldCardId ? { ...event, cardId: newCardId } : event,
			])),
			reviewDeferrals: {
				...omitKey(latestData.reviewDeferrals, oldCardId),
				...(deferral ? { [newCardId]: { ...deferral, cardId: newCardId } } : {}),
			},
			reviewStates: {
				...omitKey(latestData.reviewStates, oldCardId),
				...(reviewState ? { [newCardId]: { ...reviewState, cardId: newCardId } } : {}),
			},
			retiredCards: {
				...omitKey(latestData.retiredCards, oldCardId),
				...(retirement ? { [newCardId]: { ...retirement, cardId: newCardId } } : {}),
			},
			suspendedCards: {
				...omitKey(latestData.suspendedCards, oldCardId),
				...(suspension ? { [newCardId]: { ...suspension, cardId: newCardId } } : {}),
			},
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async pauseConcept(conceptId: string, now = new Date()): Promise<ConceptReviewPause> {
		await this.ensureLoaded();

		if (!conceptId.trim() || Number.isNaN(now.getTime())) {
			throw new Error("Concept pause requires a Concept id and valid time.");
		}

		const pause: ConceptReviewPause = {
			conceptId,
			pausedAt: now.toISOString(),
		};
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
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
	}

	async rekeyConcept(oldConceptId: string, newConceptId: string): Promise<void> {
		await this.ensureLoaded();

		if (!oldConceptId.trim() || !newConceptId.trim() || oldConceptId === newConceptId) {
			throw new Error("Concept ID migration requires two different non-empty IDs.");
		}

		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		if (latestData.pausedConcepts[newConceptId]) {
			throw new Error("The new Concept ID already has review state.");
		}

		const pause = latestData.pausedConcepts[oldConceptId];
		const nextData = {
			...latestData,
			pausedConcepts: {
				...omitKey(latestData.pausedConcepts, oldConceptId),
				...(pause ? { [newConceptId]: { ...pause, conceptId: newConceptId } } : {}),
			},
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async resumeConcept(conceptId: string): Promise<void> {
		await this.ensureLoaded();
		const latestData = this.mergePendingSettings(normalizePluginData(await this.storage.loadData()));
		const nextData = {
			...latestData,
			pausedConcepts: omitKey(latestData.pausedConcepts, conceptId),
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
		this.pendingSettings = undefined;
	}

	async deferReviewUntil(cardId: string, resumeAt: Date, now = new Date()): Promise<ReviewDeferral> {
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
		conceptDuplicateDismissals: {},
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
		conceptDuplicateDismissals: normalizeConceptDuplicateDismissals(conceptDuplicateDismissals),
		conceptSourceLinks: normalizeConceptSourceLinks(conceptSourceLinks),
		knowledgeProposals: normalizeKnowledgeProposals(knowledgeProposals),
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
