export const AI_PROPOSAL_SCHEMA_VERSION = "mneme.ai.proposals.v1" as const;
export const AI_PROPOSAL_MODE_CONCEPT_CAPTURE = "concept_capture" as const;

export const AI_CONCEPT_CAPTURE_KINDS = [
	"new_concept",
	"link_existing_concept",
	"add_view",
	"update_concept",
	"merge_concept",
] as const;

export const AI_CARD_STAGE_KINDS = [
	"new_card",
	"revise_card",
	"split_card",
	"merge_card",
	"retire_card",
] as const;

export type AiConceptProposalKindV1 = typeof AI_CONCEPT_CAPTURE_KINDS[number];

export interface AiSourceEvidenceV1 {
	explanation: string;
	quote: string;
	sourcePath: string;
}

export interface AiConceptProposalBaseV1 {
	confidence: number;
	evidence: AiSourceEvidenceV1[];
	rationale: string;
	title: string;
}

export interface AiNewConceptProposalV1 extends AiConceptProposalBaseV1 {
	kind: "new_concept";
	payload: {
		conceptTitle: string;
		coreMeaning: string;
		learningMode: "reviewable" | "exploratory";
		relatedConceptHints: string[];
		suggestedImportance: "low" | "normal" | "high" | "critical";
		summary: string;
		views: Array<{
			body: string;
			title: string;
		}>;
	};
}

export interface AiLinkExistingConceptProposalV1 extends AiConceptProposalBaseV1 {
	kind: "link_existing_concept";
	payload: {
		existingConceptId: string;
		existingConceptTitle: string;
		reason: string;
	};
}

export interface AiAddViewProposalV1 extends AiConceptProposalBaseV1 {
	kind: "add_view";
	payload: {
		targetConceptId: string;
		targetConceptTitle: string;
		viewBody: string;
		viewTitle: string;
	};
}

export interface AiUpdateConceptProposalV1 extends AiConceptProposalBaseV1 {
	kind: "update_concept";
	payload: {
		proposedCoreMeaning?: string;
		proposedSummary?: string;
		reason: string;
		targetConceptId: string;
		targetConceptTitle: string;
	};
}

export interface AiMergeConceptProposalV1 extends AiConceptProposalBaseV1 {
	kind: "merge_concept";
	payload: {
		proposedTitle: string;
		reason: string;
		sourceConceptIds: string[];
	};
}

export type AiConceptProposalV1 =
	| AiNewConceptProposalV1
	| AiLinkExistingConceptProposalV1
	| AiAddViewProposalV1
	| AiUpdateConceptProposalV1
	| AiMergeConceptProposalV1;

export interface AiStructuredProposalResponseV1 {
	mode: typeof AI_PROPOSAL_MODE_CONCEPT_CAPTURE;
	proposals: AiConceptProposalV1[];
	schemaVersion: typeof AI_PROPOSAL_SCHEMA_VERSION;
	source: {
		hash: string;
		path: string;
	};
	warnings: string[];
}
