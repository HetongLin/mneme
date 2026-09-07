export interface ManualConceptSourceSnapshot {
	contentHash: string;
	mtime: number;
	path: string;
	size: number;
}

/** Locator and recovery metadata; the existing draft retains prose only until completion. */
export interface ManualConceptWriteReceipt {
	version: 1;
	draftId: string;
	inputHash: string;
	conceptId: string;
	path: string;
	cardsPath: string;
	afterHash: string;
	englishAliasesEnabled: boolean;
	source?: ManualConceptSourceSnapshot;
	createdAt: string;
	status: "pending" | "written";
}
