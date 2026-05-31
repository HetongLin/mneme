import type {
	ConceptSourceLink,
	ConceptSourceRelationType,
	SourceEvidence,
} from "../models/conceptSource";
import type { KnowledgeProposal, NewConceptProposalPayload } from "../models/knowledgeProposal";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { normalizeVaultPath, slugifyForFilename } from "../utils/markdownPath";

export interface BuildConceptSourceLinksArgs {
	conceptId: string;
	now: string;
	proposal: KnowledgeProposal & { kind: "new_concept" };
}

export interface NormalizeWrittenConceptIdArgs {
	proposal: KnowledgeProposal;
	targetPaths: string[];
}

export function createConceptSourceLinkId(
	conceptId: string,
	sourcePath: string,
	relationType: string,
): string {
	return [
		"concept-source",
		slugifyForId(conceptId),
		slugifyForId(sourcePath),
		slugifyForId(relationType),
	].join(":");
}

export function buildConceptSourceLinksFromNewConceptProposal(
	args: BuildConceptSourceLinksArgs,
): ConceptSourceLink[] {
	const payload = isRecord(args.proposal.payload)
		? args.proposal.payload as NewConceptProposalPayload
		: undefined;
	const proposedSourceLinks = payload?.proposedSourceLinks ?? [];

	if (proposedSourceLinks.length > 0) {
		return proposedSourceLinks.map((link) => createLink({
			conceptId: args.conceptId,
			evidence: link.evidence ?? [],
			now: args.now,
			relationType: link.relationType,
			sourceHash: link.sourceHash ?? args.proposal.sourceHash ?? "",
			sourcePath: link.sourcePath,
		}));
	}

	if (!args.proposal.sourcePath) {
		return [];
	}

	return [createLink({
		conceptId: args.conceptId,
		evidence: args.proposal.evidence ?? [],
		now: args.now,
		relationType: "origin",
		sourceHash: args.proposal.sourceHash ?? "",
		sourcePath: args.proposal.sourcePath,
	})];
}

export function mergeLinkedConceptId(
	record: SourceAnalysisRecord,
	conceptId: string,
): SourceAnalysisRecord {
	if (record.linkedConceptIds.includes(conceptId)) {
		return {
			...record,
			linkedConceptIds: [...record.linkedConceptIds],
			pendingProposalIds: [...record.pendingProposalIds],
		};
	}

	return {
		...record,
		linkedConceptIds: [
			...record.linkedConceptIds,
			conceptId,
		],
		pendingProposalIds: [...record.pendingProposalIds],
	};
}

export function normalizeConceptIdForWrittenConcept(args: NormalizeWrittenConceptIdArgs): string {
	if (args.proposal.conceptId) {
		return args.proposal.conceptId;
	}

	const conceptPath = args.targetPaths.find((path) => normalizeVaultPath(path).endsWith("/Concept.md"))
		?? args.targetPaths[0];

	if (conceptPath) {
		return normalizeVaultPath(conceptPath);
	}

	return `proposal:${args.proposal.id}`;
}

function createLink(args: {
	conceptId: string;
	evidence: SourceEvidence[];
	now: string;
	relationType: ConceptSourceRelationType;
	sourceHash: string;
	sourcePath: string;
}): ConceptSourceLink {
	return {
		addedAt: args.now,
		conceptId: args.conceptId,
		evidence: [...args.evidence],
		id: createConceptSourceLinkId(args.conceptId, args.sourcePath, args.relationType),
		lastSeenAt: args.now,
		relationType: args.relationType,
		sourceHash: args.sourceHash,
		sourcePath: args.sourcePath,
		status: "approved",
	};
}

function slugifyForId(value: string): string {
	return slugifyForFilename(value)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "") || "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
