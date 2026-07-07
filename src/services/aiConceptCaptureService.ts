import type { ConceptSummary } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import type { SourceFileSnapshot } from "./sourceAnalysisDecision";
import type { AiProvider, ExistingConceptSummary } from "./aiProvider";
import { validateAiProviderConfig, validateConceptCaptureResponse } from "./aiProvider";
import { normalizeAiStructuredProposalResponse } from "./aiProposalNormalizer";
import { validateAiStructuredProposalResponse } from "./aiProposalValidator";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import type { AnalyzeSourceResult, SourceAnalysisService } from "./sourceAnalysisService";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";

export type AiConceptCaptureStatus =
	| "captured"
	| "failed"
	| "indexed_ai_disabled"
	| "invalid_config"
	| "invalid_response"
	| "skipped_ai_already_captured";

export interface AiConceptCaptureResult {
	message: string;
	proposalCount: number;
	sourceAnalysis: AnalyzeSourceResult;
	status: AiConceptCaptureStatus;
}

export interface AiConceptCaptureServiceOptions {
	conceptScanner: { scanConcepts(): Promise<ConceptSummary[]> };
	createProvider: (settings: MnemeSettings) => AiProvider;
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

		if (sourceRecord?.lastAiCaptureHash === sourceAnalysis.contentHash) {
			return this.result(
				"skipped_ai_already_captured",
				"No changes since the last AI capture.",
				sourceAnalysis,
			);
		}

		if (!sourceRecord) {
			return this.result("failed", "Source analysis record was not found after indexing.", sourceAnalysis);
		}

		try {
			const sourceContent = await this.options.readSourceContent(snapshot.path);
			const concepts = await this.options.conceptScanner.scanConcepts();
			const provider = this.options.createProvider(settings);
			const response = await provider.generateKnowledgeProposals({
				existingConceptSummaries: concepts.map(toExistingConceptSummary),
				mode: "concept_capture",
				sourceContent,
				sourceHash: sourceAnalysis.contentHash,
				sourcePath: snapshot.path,
			});
			const validation = validateAiStructuredProposalResponse(response.structuredResponse);

			if (!validation.valid) {
				return this.result("invalid_response", validation.errors.join(" "), sourceAnalysis);
			}

			if (
				validation.data.source.path !== snapshot.path
				|| validation.data.source.hash !== sourceAnalysis.contentHash
			) {
				return this.result(
					"invalid_response",
					"AI response source does not match the analyzed note.",
					sourceAnalysis,
				);
			}

			const now = this.options.timestampProvider?.() ?? new Date().toISOString();
			const proposals = normalizeAiStructuredProposalResponse(validation.data, { now });
			const captureValidation = validateConceptCaptureResponse(proposals);

			if (!captureValidation.valid) {
				return this.result("invalid_response", captureValidation.errors.join(" "), sourceAnalysis);
			}

			await this.options.proposalStore.upsertProposals(proposals);

			await this.options.sourceAnalysisStore.upsertRecord({
				...sourceRecord,
				lastAiCaptureHash: sourceAnalysis.contentHash,
				pendingProposalIds: unique([...sourceRecord.pendingProposalIds, ...proposals.map(({ id }) => id)]),
			});

			return {
				message: proposals.length === 1
					? "1 Concept proposal added to Inbox."
					: `${proposals.length} Concept proposals added to Inbox.`,
				proposalCount: proposals.length,
				sourceAnalysis,
				status: "captured",
			};
		} catch (error) {
			return this.result(
				"failed",
				error instanceof Error ? error.message : String(error),
				sourceAnalysis,
			);
		}
	}

	private result(
		status: AiConceptCaptureStatus,
		message: string,
		sourceAnalysis: AnalyzeSourceResult,
	): AiConceptCaptureResult {
		return { message, proposalCount: 0, sourceAnalysis, status };
	}
}

function toExistingConceptSummary(concept: ConceptSummary): ExistingConceptSummary {
	return {
		conceptId: concept.conceptId,
		summary: concept.coreMeaning ?? concept.whyItMatters,
		title: concept.title,
	};
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}
