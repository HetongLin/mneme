import type { SourceEvidence } from "../models/conceptSource";
import type {
	ConceptSourceLinkDraft,
	KnowledgeProposal,
	KnowledgeProposalPayload,
} from "../models/knowledgeProposal";
import {
	AI_PROPOSAL_SCHEMA_VERSION,
	AiConceptProposalV1,
	AiStructuredProposalResponseV1,
} from "./aiProposalSchema";

export interface AiProposalNormalizeOptions {
	idFactory?: (proposal: AiConceptProposalV1, index: number) => string;
	now?: string;
}

export function normalizeAiStructuredProposalResponse(
	response: AiStructuredProposalResponseV1,
	options: AiProposalNormalizeOptions = {},
): KnowledgeProposal[] {
	const now = options.now ?? new Date().toISOString();

	return response.proposals.map((proposal, index) => {
		const id = options.idFactory?.(proposal, index)
			?? createAiProposalId(response.source.path, response.source.hash, index);

		return {
			ai: {
				confidence: proposal.confidence,
				normalizedAt: now,
				rationale: proposal.rationale,
				schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
				warnings: response.warnings,
			},
			createdAt: now,
			evidence: proposal.evidence.map(toSourceEvidence),
			id,
			kind: proposal.kind,
			payload: normalizePayload(proposal, response),
			sourceHash: response.source.hash,
			sourcePath: response.source.path,
			status: "suggested",
			updatedAt: now,
		} as KnowledgeProposal;
	});
}

function normalizePayload(
	proposal: AiConceptProposalV1,
	response: AiStructuredProposalResponseV1,
): KnowledgeProposalPayload {
	switch (proposal.kind) {
		case "new_concept":
			return {
				coreMeaning: proposal.payload.coreMeaning,
				learningMode: proposal.payload.learningMode,
				proposedSourceLinks: [createSourceLinkDraft(response, proposal)],
				proposedViews: proposal.payload.views.map((view) => ({
					body: view.body,
					evidence: proposal.evidence.map(toSourceEvidence),
					sourcePath: response.source.path,
					title: view.title,
				})),
				relatedConceptHints: proposal.payload.relatedConceptHints,
				suggestedImportance: proposal.payload.suggestedImportance,
				summary: proposal.payload.summary,
				title: proposal.payload.conceptTitle,
			};
		case "link_existing_concept":
			return {
				proposedSourceLink: createSourceLinkDraft(response, proposal),
				relationReason: proposal.payload.reason,
				targetConceptId: proposal.payload.existingConceptId,
				targetConceptTitle: proposal.payload.existingConceptTitle,
			};
		case "add_view":
			return {
				conceptId: proposal.payload.targetConceptId,
				conceptTitle: proposal.payload.targetConceptTitle,
				view: {
					body: proposal.payload.viewBody,
					evidence: proposal.evidence.map(toSourceEvidence),
					sourcePath: response.source.path,
					title: proposal.payload.viewTitle,
				},
			};
		case "update_concept":
			return {
				conceptId: proposal.payload.targetConceptId,
				conceptTitle: proposal.payload.targetConceptTitle,
				proposedCoreMeaning: proposal.payload.proposedCoreMeaning,
				proposedSummary: proposal.payload.proposedSummary,
				updateReason: proposal.payload.reason,
			};
		case "merge_concept":
			const [targetConceptId, sourceConceptId] = proposal.payload.sourceConceptIds;

			return {
				mergeReason: proposal.payload.reason,
				proposedMergedTitle: proposal.payload.proposedTitle,
				sourceConceptId,
				targetConceptId: targetConceptId ?? proposal.payload.proposedTitle,
			};
	}
}

function createSourceLinkDraft(
	response: AiStructuredProposalResponseV1,
	proposal: AiConceptProposalV1,
): ConceptSourceLinkDraft {
	return {
		evidence: proposal.evidence.map(toSourceEvidence),
		relationType: "origin",
		sourceHash: response.source.hash,
		sourcePath: response.source.path,
	};
}

function toSourceEvidence(evidence: { quote: string }): SourceEvidence {
	return {
		excerpt: evidence.quote,
	};
}

function createAiProposalId(sourcePath: string, sourceHash: string, index: number): string {
	const slug = `${sourcePath}-${sourceHash}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);

	return `ai-proposal-${slug || "source"}-${index + 1}`;
}
