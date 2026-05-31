import { ReviewScheduler } from "../models/reviewScheduler";
import { CardReviewState, MnemePluginData, ReviewRating } from "../models/reviewState";
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

const CURRENT_SCHEMA_VERSION = 1;

export interface ReviewStateStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ReviewStateStore {
	private data: MnemePluginData = createDefaultPluginData();
	private isLoaded = false;

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
		const scheduleResult = this.scheduler.schedule({
			cardId,
			previousState: this.getState(cardId),
			rating,
			reviewedAt: new Date().toISOString(),
		});
		const nextData = {
			...this.data,
			reviewStates: {
				...this.data.reviewStates,
				[cardId]: scheduleResult.nextState,
			},
		};

		await this.storage.saveData(nextData);
		this.data = nextData;

		return scheduleResult.nextState;
	}

	getAllStates(): Record<string, CardReviewState> {
		return { ...this.data.reviewStates };
	}

	getReviewStateCount(): number {
		return Object.keys(this.data.reviewStates).length;
	}

	setSettings(settings: MnemeSettings): void {
		this.data = {
			...this.data,
			settings: normalizeSettings(settings),
		};
	}

	async clearReviewStates(): Promise<void> {
		await this.ensureLoaded();
		const nextData = {
			...this.data,
			reviewStates: {},
			schemaVersion: this.data.schemaVersion,
		};

		await this.storage.saveData(nextData);
		this.data = nextData;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.isLoaded) {
			return;
		}

		await this.load();
	}
}

export function createDefaultPluginData(): MnemePluginData {
	return {
		conceptSourceLinks: {},
		knowledgeProposals: {},
		reviewStates: {},
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
		conceptSourceLinks: normalizeConceptSourceLinks(conceptSourceLinks),
		knowledgeProposals: normalizeKnowledgeProposals(knowledgeProposals),
		reviewStates: normalizeReviewStates(reviewStates),
		schemaVersion: CURRENT_SCHEMA_VERSION,
		settings: normalizeSettings(data.settings),
		sourceAnalysisRecords: normalizeSourceAnalysisRecords(sourceAnalysisRecords),
	};
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
