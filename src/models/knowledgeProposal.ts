import type { SourceEvidence } from "./conceptSource";

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

interface KnowledgeProposalBase {
	cardId?: string;
	conceptId?: string;
	createdAt: string;
	evidence?: SourceEvidence[];
	id: string;
	sourceHash?: string;
	sourcePath?: string;
	status: KnowledgeProposalStatus;
	updatedAt: string;
}

export type KnowledgeProposal =
	| (KnowledgeProposalBase & { kind: "new_concept" })
	| (KnowledgeProposalBase & { kind: "link_existing_concept" })
	| (KnowledgeProposalBase & { kind: "merge_concept" })
	| (KnowledgeProposalBase & { kind: "add_view" })
	| (KnowledgeProposalBase & { kind: "update_concept" })
	| (KnowledgeProposalBase & { kind: "new_card" })
	| (KnowledgeProposalBase & { kind: "revise_card" })
	| (KnowledgeProposalBase & { kind: "split_card" })
	| (KnowledgeProposalBase & { kind: "merge_card" })
	| (KnowledgeProposalBase & { kind: "retire_card" });
