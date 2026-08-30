import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { computeContentHash } from "../utils/sourceHash";
import type { SourceFileSnapshot } from "./sourceAnalysisDecision";
import { shouldAnalyzeSource } from "./sourceAnalysisDecision";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";

export type AnalyzeSourceStatus =
	| "analyzed"
	| "skipped_metadata_unchanged"
	| "skipped_hash_unchanged"
	| "requires_content_hash"
	| "failed";

export interface AnalyzeSourceResult {
	contentHash?: string;
	message: string;
	previousHash?: string;
	record?: SourceAnalysisRecord;
	sourcePath: string;
	status: AnalyzeSourceStatus;
}

export interface AnalyzeSourceOptions {
	persist?: boolean;
}

export type SourceContentReader = (sourcePath: string) => Promise<string>;
export type TimestampProvider = () => string;

export class SourceAnalysisService {
	constructor(
		private readonly store: SourceAnalysisStore,
		private readonly readContent: SourceContentReader,
		private readonly getTimestamp: TimestampProvider = () => new Date().toISOString(),
	) {
	}

	async analyzeSource(
		snapshot: SourceFileSnapshot,
		options: AnalyzeSourceOptions = {},
	): Promise<AnalyzeSourceResult> {
		try {
			const previous = await this.store.getRecord(snapshot.path);
			const initialDecision = shouldAnalyzeSource(previous, snapshot);

			if (initialDecision.type === "skip_metadata_unchanged") {
				return {
					contentHash: previous?.contentHash,
					message: "No changes since last analysis.",
					previousHash: previous?.contentHash,
					record: previous,
					sourcePath: snapshot.path,
					status: "skipped_metadata_unchanged",
				};
			}

			if (!initialDecision.shouldReadContent && !initialDecision.shouldAnalyze) {
				return {
					message: "Source requires a content hash before analysis can continue.",
					previousHash: previous?.contentHash,
					sourcePath: snapshot.path,
					status: "requires_content_hash",
				};
			}

			const content = await this.readContent(snapshot.path);
			const contentHash = await computeContentHash(content);
			const decision = shouldAnalyzeSource(previous, snapshot, contentHash);

			if (decision.type === "skip_hash_unchanged" && previous) {
				const nextRecord: SourceAnalysisRecord = {
					...previous,
					lastAnalyzedAt: this.getTimestamp(),
					mtime: snapshot.mtime,
					size: snapshot.size,
					status: "clean",
				};

				if (options.persist !== false) {
					await this.store.upsertRecord(nextRecord);
				}

				return {
					contentHash,
					message: "Content hash unchanged.",
					previousHash: previous.contentHash,
					record: nextRecord,
					sourcePath: snapshot.path,
					status: "skipped_hash_unchanged",
				};
			}

			const nextRecord = createSourceAnalysisRecord(snapshot, contentHash, previous, this.getTimestamp());

			if (options.persist !== false) {
				await this.store.upsertRecord(nextRecord);
			}

			return {
				contentHash,
				message: previous
					? "Source changed and is ready for proposal generation."
					: "Source note indexed.",
				previousHash: previous?.contentHash,
				record: nextRecord,
				sourcePath: snapshot.path,
				status: "analyzed",
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			return {
				message,
				sourcePath: snapshot.path,
				status: "failed",
			};
		}
	}
}

function createSourceAnalysisRecord(
	snapshot: SourceFileSnapshot,
	contentHash: string,
	previous: SourceAnalysisRecord | undefined,
	lastAnalyzedAt: string,
): SourceAnalysisRecord {
	return {
		contentHash,
		lastAnalyzedAt,
		linkedConceptIds: previous?.linkedConceptIds ?? [],
		mtime: snapshot.mtime,
		pendingProposalIds: previous?.pendingProposalIds ?? [],
		size: snapshot.size,
		sourcePath: snapshot.path,
		status: previous ? "stale" : "clean",
	};
}
