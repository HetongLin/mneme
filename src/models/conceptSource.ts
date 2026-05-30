export type ConceptSourceRelationType =
	| "origin"
	| "supporting"
	| "example"
	| "application"
	| "contrast"
	| "exam"
	| "project"
	| "update";

export type ConceptSourceLinkStatus = "suggested" | "approved" | "rejected" | "stale";

export interface SourceEvidence {
	blockId?: string;
	excerpt: string;
	heading?: string;
	lineEnd?: number;
	lineStart?: number;
}

export interface ConceptSourceLink {
	addedAt: string;
	conceptId: string;
	evidence: SourceEvidence[];
	id: string;
	lastSeenAt: string;
	relationType: ConceptSourceRelationType;
	sourceHash: string;
	sourcePath: string;
	status: ConceptSourceLinkStatus;
}

export function getApprovedConceptSourceLinks(links: ConceptSourceLink[]): ConceptSourceLink[] {
	return links.filter((link) => link.status === "approved");
}
