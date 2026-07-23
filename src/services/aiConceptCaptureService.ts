import type { MnemeSettings } from "../models/settings";
import type { SourceFileSnapshot } from "./sourceAnalysisDecision";
import type { AiProposalResponse, AiProvider } from "./aiProvider";
import type { AiGenerationLock } from "./aiGenerationLock";
import { validateAiProviderConfig, validateConceptCaptureResponse } from "./aiProvider";
import { createAiConceptCaptureFingerprint, getEffectiveConceptCaptureChunkSize } from "./aiCaptureFingerprint";
import { consolidateAiConceptProposals } from "./aiConceptProposalConsolidator";
import { normalizeAiStructuredProposalResponse } from "./aiProposalNormalizer";
import { AI_PROPOSAL_SCHEMA_VERSION, AiConceptCaptureResponseV1 } from "./aiProposalSchema";
import { validateAiStructuredProposalResponse } from "./aiProposalValidator";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import { reconcileConceptGrounding } from "./proposalGroundingReconciler";
import type { AnalyzeSourceResult, SourceAnalysisService } from "./sourceAnalysisService";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";
import { splitSourceForAiCapture } from "./sourceCaptureChunker";
import {
	buildConceptTagCatalogFromTags,
	reconcileGeneratedConceptTags,
} from "./conceptTagCatalog";
import type { KnowledgeProposal } from "../models/knowledgeProposal";

export type AiConceptCaptureStatus =
	| "captured"
	| "failed"
	| "generation_in_progress"
	| "indexed_ai_disabled"
	| "invalid_config"
	| "invalid_response"
	| "skipped_ai_already_captured";

export interface AiConceptCaptureResult {
	analyzedChars?: number;
	chunkCount?: number;
	message: string;
	proposalCount: number;
	sourceAnalysis?: AnalyzeSourceResult;
	status: AiConceptCaptureStatus;
	totalChars?: number;
}

export interface AiConceptCaptureServiceOptions {
	createProvider: (settings: MnemeSettings) => AiProvider;
	existingTagsProvider?: () => Promise<string[]>;
	generationLock: AiGenerationLock;
	proposalStore: KnowledgeProposalStore;
	readSourceContent: (sourcePath: string) => Promise<string>;
	settingsProvider: () => MnemeSettings;
	sourceAnalysisService: SourceAnalysisService;
	sourceAnalysisStore: SourceAnalysisStore;
	timestampProvider?: () => string;
}

export class AiConceptCaptureService {
	constructor(private readonly options: AiConceptCaptureServiceOptions) {
	}

	async analyze(snapshot: SourceFileSnapshot): Promise<AiConceptCaptureResult> {
		const lease = this.options.generationLock.tryAcquire("concept_capture", snapshot.path);

		if (!lease) {
			return {
				message: "Concept generation is already in progress for this Source Note. Wait for the current request to finish.",
				proposalCount: 0,
				status: "generation_in_progress",
			};
		}

		try {
			return await this.analyzeWithLock(snapshot);
		} finally {
			lease.release();
		}
	}

	private async analyzeWithLock(snapshot: SourceFileSnapshot): Promise<AiConceptCaptureResult> {
		const sourceAnalysis = await this.options.sourceAnalysisService.analyzeSource(snapshot);

		if (sourceAnalysis.status === "failed" || !sourceAnalysis.contentHash) {
			return this.result("failed", sourceAnalysis.message, sourceAnalysis);
		}

		const settings = this.options.settingsProvider();

		if (!settings.aiCaptureEnabled) {
			return this.result(
				"indexed_ai_disabled",
				"Source note indexed. Enable AI Capture to generate Concept proposals.",
				sourceAnalysis,
			);
		}

		const configValidation = validateAiProviderConfig(settings);

		if (!configValidation.valid) {
			return this.result("invalid_config", configValidation.errors.join(" "), sourceAnalysis);
		}

		const sourceRecord = await this.options.sourceAnalysisStore.getRecord(snapshot.path);

		if (!sourceRecord) {
			return this.result("failed", "Source analysis record was not found after indexing.", sourceAnalysis);
		}

		try {
			const captureFingerprint = await createAiConceptCaptureFingerprint(
				sourceAnalysis.contentHash,
				snapshot.path,
				settings,
			);

			if (sourceRecord.lastAiCaptureFingerprint === captureFingerprint) {
				return this.result(
					"skipped_ai_already_captured",
					formatPreviousCaptureMessage(sourceRecord),
					sourceAnalysis,
					{
						analyzedChars: sourceRecord.lastAiCaptureAnalyzedChars,
						chunkCount: sourceRecord.lastAiCaptureChunkCount,
						totalChars: sourceRecord.lastAiCaptureTotalChars,
					},
				);
			}

			const sourceContent = await this.options.readSourceContent(snapshot.path);
			const chunks = splitSourceForAiCapture(sourceContent, getEffectiveConceptCaptureChunkSize(settings));
			const provider = this.options.createProvider(settings);
			const chunkResponses: AiConceptCaptureResponseV1[] = [];
			let rawProposalCount = 0;

			for (const chunk of chunks) {
				const chunkPrefix = chunks.length > 1 ? `Chunk ${chunk.index}/${chunk.total}: ` : "";
				let response: AiProposalResponse;

				try {
					response = await provider.generateKnowledgeProposals({
						languageReferenceContent: sourceContent,
						mode: "concept_capture",
						sourceChunk: {
							end: chunk.end,
							index: chunk.index,
							start: chunk.start,
							total: chunk.total,
							totalChars: chunk.totalChars,
						},
						sourceContent: chunk.content,
						sourceHash: sourceAnalysis.contentHash,
						sourcePath: snapshot.path,
					});
				} catch (error) {
					return this.result(
						"failed",
						`${chunkPrefix}${error instanceof Error ? error.message : String(error)}`,
						sourceAnalysis,
					);
				}

				const validation = validateAiStructuredProposalResponse(response.structuredResponse);

				if (!validation.valid) {
					return this.result("invalid_response", `${chunkPrefix}${validation.errors.join(" ")}`, sourceAnalysis);
				}

				if (
					validation.data.source.path !== snapshot.path
					|| validation.data.source.hash !== sourceAnalysis.contentHash
				) {
					return this.result(
						"invalid_response",
						`${chunkPrefix}AI response source does not match the analyzed note.`,
						sourceAnalysis,
					);
				}

				if (validation.data.mode !== "concept_capture") {
					return this.result(
						"invalid_response",
						`${chunkPrefix}Concept capture must return concept_capture mode.`,
						sourceAnalysis,
					);
				}

				rawProposalCount += validation.data.proposals.length;
				const grounding = reconcileConceptGrounding(validation.data, sourceContent, snapshot.path);

				if (validation.data.proposals.length > 0 && grounding.response.proposals.length === 0) {
					chunkResponses.push({
						...grounding.response,
						warnings: [
							...grounding.response.warnings,
							`${chunkPrefix}Mneme ignored ungrounded Concept proposals from this chunk and continued analyzing the note.`,
						],
					});
					continue;
				}

				chunkResponses.push(grounding.response);
			}

			const consolidation = consolidateAiConceptProposals(
				chunkResponses.flatMap((response) => response.proposals),
			);
			const analyzedChars = chunks.reduce((total, chunk) => total + chunk.content.length, 0);
			const warnings = unique([
				...chunkResponses.flatMap((response) => response.warnings),
				`Mneme analyzed ${analyzedChars}/${sourceContent.length} Source Note characters across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`,
				...(consolidation.deduplicatedCount > 0
					? [`Mneme consolidated ${consolidation.deduplicatedCount} duplicate cross-chunk Concept proposal${consolidation.deduplicatedCount === 1 ? "" : "s"}.`]
					: []),
			]);
			const aggregatedResponse: AiConceptCaptureResponseV1 = {
				mode: "concept_capture",
				proposals: consolidation.proposals,
				schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
				source: { hash: sourceAnalysis.contentHash, path: snapshot.path },
				warnings,
			};

			if (rawProposalCount > 0 && aggregatedResponse.proposals.length === 0) {
				return this.result(
					"invalid_response",
					`AI returned ${formatProposalCount(rawProposalCount)} without verifiable Source Note quotes. No proposals added.`,
					sourceAnalysis,
				);
			}

			const now = this.options.timestampProvider?.() ?? new Date().toISOString();
			const tagCatalog = buildConceptTagCatalogFromTags(await this.readExistingTags());
			const proposals = normalizeAiStructuredProposalResponse(aggregatedResponse, {
				idFactory: (_proposal, index) => [
					"ai-proposal",
					sourceAnalysis.contentHash?.slice(0, 12),
					captureFingerprint.slice(0, 12),
					index + 1,
				].join("-"),
				now,
			}).map((proposal) => reconcileProposalTags(proposal, tagCatalog));
			const captureValidation = validateConceptCaptureResponse(proposals);

			if (!captureValidation.valid) {
				return this.result("invalid_response", captureValidation.errors.join(" "), sourceAnalysis);
			}

			await this.options.proposalStore.upsertProposals(proposals);

			await this.options.sourceAnalysisStore.upsertRecord({
				...sourceRecord,
				lastAiCaptureAnalyzedChars: analyzedChars,
				lastAiCaptureChunkCount: chunks.length,
				lastAiCaptureFingerprint: captureFingerprint,
				lastAiCaptureTotalChars: sourceContent.length,
				pendingProposalIds: unique([...sourceRecord.pendingProposalIds, ...proposals.map(({ id }) => id)]),
			});

			return {
				analyzedChars,
				chunkCount: chunks.length,
				message: formatCaptureMessage(proposals.length, analyzedChars, sourceContent.length, chunks.length),
				proposalCount: proposals.length,
				sourceAnalysis,
				status: "captured",
				totalChars: sourceContent.length,
			};
		} catch (error) {
			return this.result(
				"failed",
				error instanceof Error ? error.message : String(error),
				sourceAnalysis,
			);
		}
	}

	private async readExistingTags(): Promise<string[]> {
		try {
			return await this.options.existingTagsProvider?.() ?? [];
		} catch (error) {
			console.error("Mneme: existing Concept tags could not be loaded for local reconciliation", error);
			return [];
		}
	}

	private result(
		status: AiConceptCaptureStatus,
		message: string,
		sourceAnalysis: AnalyzeSourceResult,
		coverage: Pick<AiConceptCaptureResult, "analyzedChars" | "chunkCount" | "totalChars"> = {},
	): AiConceptCaptureResult {
		return { ...coverage, message, proposalCount: 0, sourceAnalysis, status };
	}
}

function reconcileProposalTags(
	proposal: KnowledgeProposal,
	tagCatalog: ReturnType<typeof buildConceptTagCatalogFromTags>,
): KnowledgeProposal {
	if (proposal.kind !== "new_concept" || !proposal.payload) return proposal;
	const reconciled = reconcileGeneratedConceptTags(proposal.payload.tags ?? [], tagCatalog);

	return {
		...proposal,
		payload: {
			...proposal.payload,
			tags: reconciled.tags,
		},
	};
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function formatCaptureMessage(proposalCount: number, analyzedChars: number, totalChars: number, chunkCount: number): string {
	const proposalMessage = proposalCount === 0
		? "No Concept changes proposed."
		: proposalCount === 1
			? "1 Concept proposal added to Inbox."
			: `${proposalCount} Concept proposals added to Inbox.`;

	return `${proposalMessage} Analyzed ${analyzedChars}/${totalChars} characters across ${chunkCount} chunk${chunkCount === 1 ? "" : "s"}.`;
}

function formatProposalCount(proposalCount: number): string {
	return proposalCount === 1 ? "1 Concept proposal" : `${proposalCount} Concept proposals`;
}

function formatPreviousCaptureMessage(record: {
	lastAiCaptureAnalyzedChars?: number;
	lastAiCaptureChunkCount?: number;
	lastAiCaptureTotalChars?: number;
}): string {
	if (
		record.lastAiCaptureAnalyzedChars === undefined
		|| record.lastAiCaptureTotalChars === undefined
		|| record.lastAiCaptureChunkCount === undefined
	) {
		return "No changes since the last AI capture.";
	}

	return `No changes since the last AI capture. Last capture analyzed ${record.lastAiCaptureAnalyzedChars}/${record.lastAiCaptureTotalChars} characters across ${record.lastAiCaptureChunkCount} chunk${record.lastAiCaptureChunkCount === 1 ? "" : "s"}.`;
}
