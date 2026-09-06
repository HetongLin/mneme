export interface MarkdownWriteDraft {
	content: string;
	kind: "concept" | "card";
	mode: "create" | "append" | "modify" | "upsert_card_group";
	sourceProposalId: string;
	targetPath: string;
}

export interface MarkdownWriteResult {
	message: string;
	proposalId: string;
	status: "written" | "skipped" | "failed";
	targetPaths: string[];
}

/** Durable write intent only; learning content remains in the proposal/Markdown. */
export interface ApprovedWriteReceipt {
	version: 1;
	proposalHash: string;
	targetPath: string;
	mode: "create" | "upsert_card_group" | "modify";
	entityId?: string;
	beforeHash?: string;
	afterHash: string;
	createdAt: string;
}
