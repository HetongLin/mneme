export type SourceAnalysisStatus = "clean" | "stale" | "analyzing" | "failed";
export type CardGenerationOutcome = "proposed" | "coverage_complete";

export interface SourceAnalysisRecord {
	contentHash: string;
	lastAiCaptureAnalyzedChars?: number;
	lastAiCaptureChunkCount?: number;
	lastAiCaptureFingerprint?: string;
	lastAiCaptureTotalChars?: number;
	lastCardGenerationFingerprint?: string;
	lastCardGenerationOutcome?: CardGenerationOutcome;
	/** @deprecated Use lastCardGenerationFingerprint. Retained for data compatibility. */
	lastCardGenerationHash?: string;
	lastAnalyzedAt: string;
	linkedConceptIds: string[];
	mtime: number;
	pendingProposalIds: string[];
	size: number;
	sourcePath: string;
	status: SourceAnalysisStatus;
}
