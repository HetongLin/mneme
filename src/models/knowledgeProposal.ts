import type { ConceptSourceRelationType, SourceEvidence } from "./conceptSource";

export const KNOWLEDGE_PROPOSAL_KINDS = [
	"new_concept",
	"link_existing_concept",
	"merge_concept",
	"add_view",
	"update_concept",
	"new_card",
	"revise_card",
	"split_card",
	"merge_card",
	"retire_card",
] as const;

export const KNOWLEDGE_PROPOSAL_STATUSES = [
	"suggested",
	"opened",
	"edited",
	"approved",
	"rejected",
	"merged",
	"written",
	"stale",
] as const;

export type KnowledgeProposalKind = typeof KNOWLEDGE_PROPOSAL_KINDS[number];
export type KnowledgeProposalStatus = typeof KNOWLEDGE_PROPOSAL_STATUSES[number];

export type SuggestedImportance = "low" | "normal" | "high" | "critical";
export type ProposalLearningMode = "reviewable" | "exploratory";
export type CardDraftType =
	| "definition"
	| "distinction"
	| "procedure"
	| "example"
	| "trap"
	| "proof"
	| "application"
	| "mastery"
	| "other";

export interface ConceptViewDraft {
	body: string;
	evidence?: SourceEvidence[];
	sourcePath?: string;
	title: string;
}

export interface ConceptSourceLinkDraft {
	evidence?: SourceEvidence[];
	relationType: ConceptSourceRelationType;
	sourceHash?: string;
	sourcePath: string;
}

export interface CardDraft {
	back: string;
	cardType?: CardDraftType;
	evidence?: SourceEvidence[];
	front: string;
	rubric?: string;
	sourcePath?: string;
}

export interface NewConceptProposalPayload {
	coreMeaning?: string;
	learningMode?: ProposalLearningMode;
	proposedCards?: CardDraft[];
	proposedSourceLinks?: ConceptSourceLinkDraft[];
	proposedViews?: ConceptViewDraft[];
	suggestedImportance?: SuggestedImportance;
	summary?: string;
	title: string;
}

export interface LinkExistingConceptProposalPayload {
	proposedSourceLink: ConceptSourceLinkDraft;
	relationReason?: string;
	targetConceptId: string;
	targetConceptTitle?: string;
}

export interface MergeConceptProposalPayload {
	mergeReason?: string;
	proposedMergedSummary?: string;
	proposedMergedTitle?: string;
	sourceConceptId?: string;
	sourceConceptTitle?: string;
	targetConceptId: string;
	targetConceptTitle?: string;
}

export interface AddViewProposalPayload {
	conceptId: string;
	conceptTitle?: string;
	view: ConceptViewDraft;
}

export interface UpdateConceptProposalPayload {
	conceptId: string;
	conceptTitle?: string;
	proposedCoreMeaning?: string;
	proposedSourceLinks?: ConceptSourceLinkDraft[];
	proposedSummary?: string;
	proposedViews?: ConceptViewDraft[];
	updateReason?: string;
}

export interface NewCardProposalPayload {
	card: CardDraft;
	conceptId: string;
	conceptTitle?: string;
}

export interface ReviseCardProposalPayload {
	cardId: string;
	conceptId?: string;
	conceptTitle?: string;
	revisedCard: CardDraft;
	revisionReason?: string;
}

export interface SplitCardProposalPayload {
	conceptId?: string;
	conceptTitle?: string;
	replacementCards: CardDraft[];
	sourceCardId: string;
	splitReason?: string;
}

export interface MergeCardProposalPayload {
	conceptId?: string;
	conceptTitle?: string;
	mergeReason?: string;
	mergedCard: CardDraft;
	sourceCardIds: string[];
}

export interface RetireCardProposalPayload {
	cardId: string;
	conceptId?: string;
	conceptTitle?: string;
	retireReason?: string;
}

export type KnowledgeProposalPayload =
	| NewConceptProposalPayload
	| LinkExistingConceptProposalPayload
	| MergeConceptProposalPayload
	| AddViewProposalPayload
	| UpdateConceptProposalPayload
	| NewCardProposalPayload
	| ReviseCardProposalPayload
	| SplitCardProposalPayload
	| MergeCardProposalPayload
	| RetireCardProposalPayload;

export interface KnowledgeProposalBase {
	cardId?: string;
	conceptId?: string;
	createdAt: string;
	evidence?: SourceEvidence[];
	id: string;
	payload?: KnowledgeProposalPayload;
	sourceHash?: string;
	sourcePath?: string;
	status: KnowledgeProposalStatus;
	updatedAt: string;
}

export type KnowledgeProposal =
	| (KnowledgeProposalBase & { kind: "new_concept"; payload?: NewConceptProposalPayload })
	| (KnowledgeProposalBase & { kind: "link_existing_concept"; payload?: LinkExistingConceptProposalPayload })
	| (KnowledgeProposalBase & { kind: "merge_concept"; payload?: MergeConceptProposalPayload })
	| (KnowledgeProposalBase & { kind: "add_view"; payload?: AddViewProposalPayload })
	| (KnowledgeProposalBase & { kind: "update_concept"; payload?: UpdateConceptProposalPayload })
	| (KnowledgeProposalBase & { kind: "new_card"; payload?: NewCardProposalPayload })
	| (KnowledgeProposalBase & { kind: "revise_card"; payload?: ReviseCardProposalPayload })
	| (KnowledgeProposalBase & { kind: "split_card"; payload?: SplitCardProposalPayload })
	| (KnowledgeProposalBase & { kind: "merge_card"; payload?: MergeCardProposalPayload })
	| (KnowledgeProposalBase & { kind: "retire_card"; payload?: RetireCardProposalPayload });
