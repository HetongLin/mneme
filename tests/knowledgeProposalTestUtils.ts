import type { KnowledgeProposal } from "../src/models/knowledgeProposal";
import type { ConceptSourceLink } from "../src/models/conceptSource";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { SourceAnalysisRecord } from "../src/models/sourceAnalysis";
import type { KnowledgeProposalStorage } from "../src/services/knowledgeProposalStore";

export class MemoryKnowledgeProposalStorage implements KnowledgeProposalStorage {
	savedData?: MnemePluginData;

	constructor(private data: unknown) {
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.savedData = data;
		this.data = data;
	}
}

export function createPluginData(
	knowledgeProposals: Record<string, KnowledgeProposal> = {},
	sourceAnalysisRecords: Record<string, SourceAnalysisRecord> = {},
	conceptSourceLinks: Record<string, ConceptSourceLink> = {},
): MnemePluginData {
	return {
		conceptSourceLinks,
		knowledgeProposals,
		reviewDeferrals: {},
		reviewStates: {},
		schemaVersion: 1,
		settings: DEFAULT_SETTINGS,
		sourceAnalysisRecords,
	};
}

export function createConceptSourceLink(id: string, overrides: Partial<ConceptSourceLink> = {}): ConceptSourceLink {
	return {
		addedAt: "2026-01-01T12:00:00.000Z",
		conceptId: "Mneme/Concepts/Encapsulation/Concept.md",
		evidence: [],
		id,
		lastSeenAt: "2026-01-01T12:00:00.000Z",
		relationType: "origin",
		sourceHash: "source-hash",
		sourcePath: "Notes/Intro.md",
		status: "approved",
		...overrides,
	};
}

export function createProposal(
	id: string,
	overrides: Partial<KnowledgeProposal> = {},
): KnowledgeProposal {
	return {
		createdAt: "2026-01-01T12:00:00.000Z",
		id,
		kind: "new_concept",
		status: "suggested",
		updatedAt: "2026-01-01T12:00:00.000Z",
		...overrides,
	} as KnowledgeProposal;
}

export function createSourceRecord(sourcePath: string): SourceAnalysisRecord {
	return {
		contentHash: "source-hash",
		lastAnalyzedAt: "2026-01-01T12:00:00.000Z",
		linkedConceptIds: [],
		mtime: 100,
		pendingProposalIds: [],
		size: 200,
		sourcePath,
		status: "clean",
	};
}
