import type { SourceAnalysisRecord } from "../models/sourceAnalysis";

export type SourceAnalysisDecisionType =
	| "analyze"
	| "skip_metadata_unchanged"
	| "skip_hash_unchanged"
	| "missing_hash_requires_read"
	| "stale_hash_changed";

export interface SourceFileSnapshot {
	content?: string;
	mtime: number;
	path: string;
	size: number;
}

export interface SourceAnalysisDecision {
	type: SourceAnalysisDecisionType;
	shouldAnalyze: boolean;
	shouldReadContent: boolean;
}

export function shouldAnalyzeSource(
	previous: SourceAnalysisRecord | undefined,
	current: SourceFileSnapshot,
	currentHash?: string,
): SourceAnalysisDecision {
	if (!previous) {
		return createDecision("analyze", true, currentHash === undefined);
	}

	if (previous.mtime === current.mtime && previous.size === current.size) {
		return createDecision("skip_metadata_unchanged", false, false);
	}

	if (currentHash === undefined) {
		return createDecision("missing_hash_requires_read", false, true);
	}

	if (currentHash === previous.contentHash) {
		return createDecision("skip_hash_unchanged", false, false);
	}

	return createDecision("stale_hash_changed", true, false);
}

function createDecision(
	type: SourceAnalysisDecisionType,
	shouldAnalyze: boolean,
	shouldReadContent: boolean,
): SourceAnalysisDecision {
	return {
		shouldAnalyze,
		shouldReadContent,
		type,
	};
}
