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
