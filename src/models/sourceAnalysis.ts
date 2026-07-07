export type SourceAnalysisStatus = "clean" | "stale" | "analyzing" | "failed";

export interface SourceAnalysisRecord {
	contentHash: string;
	lastAiCaptureHash?: string;
	lastAnalyzedAt: string;
	linkedConceptIds: string[];
	mtime: number;
	pendingProposalIds: string[];
	size: number;
	sourcePath: string;
	status: SourceAnalysisStatus;
}
