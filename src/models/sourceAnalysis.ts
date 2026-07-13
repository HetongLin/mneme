export type SourceAnalysisStatus = "clean" | "stale" | "analyzing" | "failed";
export type CardGenerationOutcome = "proposed" | "coverage_complete";

export interface SourceAnalysisRecord {
	contentHash: string;
	lastCardGenerationFingerprint?: string;
	lastCardGenerationOutcome?: CardGenerationOutcome;
	/** @deprecated Use lastCardGenerationFingerprint. Retained for data compatibility. */
	lastCardGenerationHash?: string;
	lastAiCaptureHash?: string;
	lastAnalyzedAt: string;
	linkedConceptIds: string[];
	mtime: number;
	pendingProposalIds: string[];
	size: number;
	sourcePath: string;
	status: SourceAnalysisStatus;
}
