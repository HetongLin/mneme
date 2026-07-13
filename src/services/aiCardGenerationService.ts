import type { MnemeSettings } from "../models/settings";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { computeContentHash } from "../utils/sourceHash";
import type { AiProvider } from "./aiProvider";
import { validateAiProviderConfig, validateCardGenerationResponse } from "./aiProvider";
import { normalizeAiStructuredProposalResponse } from "./aiProposalNormalizer";
import { validateAiStructuredProposalResponse } from "./aiProposalValidator";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";
import { extractConceptLearningContent } from "./conceptLearningContent";

const ACTIVE_STATUSES = new Set(["suggested", "opened", "edited", "stale", "approved"]);

export interface AiCardGenerationInput {
	conceptId: string;
	conceptMtime?: number;
	conceptPath: string;
	conceptSize?: number;
	conceptTitle: string;
	existingCardFronts?: string[];
	markdown: string;
}

export type AiCardGenerationStatus =
	| "ai_disabled"
	| "coverage_complete"
	| "failed"
	| "generated"
	| "invalid_config"
	| "invalid_response"
	| "skipped_active_proposals"
	| "skipped_unchanged_concept";

export interface AiCardGenerationResult {
	message: string;
	proposalCount: number;
	status: AiCardGenerationStatus;
}

export interface AiCardGenerationServiceOptions {
	createProvider: (settings: MnemeSettings) => AiProvider;
	proposalStore: KnowledgeProposalStore;
	settingsProvider: () => MnemeSettings;
	sourceAnalysisStore?: SourceAnalysisStore;
	timestampProvider?: () => string;
}

export class AiCardGenerationService {
	constructor(private readonly options: AiCardGenerationServiceOptions) {
	}

	async generate(input: AiCardGenerationInput): Promise<AiCardGenerationResult> {
		const settings = this.options.settingsProvider();

		if (!settings.aiCaptureEnabled) {
			return this.result("ai_disabled", "Enable AI Capture to generate Card proposals.");
		}

		const configValidation = validateAiProviderConfig(settings);

		if (!configValidation.valid) {
			return this.result("invalid_config", configValidation.errors.join(" "));
		}

		try {
			const learningContent = extractConceptLearningContent(input.markdown, input.conceptPath);
			const learningFingerprint = await computeContentHash(learningContent);
			const contentHash = await computeContentHash(input.markdown);
			const existing = await this.options.proposalStore.listBySourcePath(input.conceptPath);
			const hasActiveProposal = existing.some((proposal) => (
				proposal.kind === "new_card"
					&& proposal.sourceHash === learningFingerprint
					&& ACTIVE_STATUSES.has(proposal.status)
			));

			if (hasActiveProposal) {
				return this.result("skipped_active_proposals", "Card proposals for this Concept are already in Inbox.");
			}

			const previousGenerationRecord = await this.options.sourceAnalysisStore?.getRecord(input.conceptPath);
			const hasWrittenProposal = existing.some((proposal) => (
				proposal.kind === "new_card"
					&& proposal.sourceHash === learningFingerprint
					&& proposal.status === "written"
			));
			const previousFingerprint = previousGenerationRecord?.lastCardGenerationFingerprint
				?? previousGenerationRecord?.lastCardGenerationHash;
			if (
				previousFingerprint === learningFingerprint
				&& (hasWrittenProposal || previousGenerationRecord?.lastCardGenerationOutcome === "coverage_complete")
			) {
				return this.result(
					"skipped_unchanged_concept",
					"No new assessable Concept content is available for Card generation.",
				);
			}

			const provider = this.options.createProvider(settings);
			const response = await provider.generateKnowledgeProposals({
				conceptId: input.conceptId,
				conceptTitle: input.conceptTitle,
				existingCardFronts: normalizeExistingCardFronts(input.existingCardFronts),
				mode: "card_generation",
				sourceContent: learningContent,
				sourceHash: learningFingerprint,
				sourcePath: input.conceptPath,
			});
			const validation = validateAiStructuredProposalResponse(response.structuredResponse);

			if (!validation.valid) {
				return this.result("invalid_response", validation.errors.join(" "));
			}

			if (validation.data.mode !== "card_generation") {
				return this.result("invalid_response", "AI response mode does not match Card generation.");
			}

			if (validation.data.source.path !== input.conceptPath || validation.data.source.hash !== learningFingerprint) {
				return this.result("invalid_response", "AI response source does not match the written Concept.");
			}

			const hasInvalidGrounding = validation.data.proposals.some((proposal) => (
				proposal.evidence.some((evidence) => (
					evidence.sourcePath !== input.conceptPath
						|| !learningContent.includes(evidence.quote)
				))
			));

			if (hasInvalidGrounding) {
				return this.result(
					"invalid_response",
					"Every Card proposal must quote grounding from the current approved Concept.",
				);
			}

			const proposals = normalizeAiStructuredProposalResponse(validation.data, {
				now: this.options.timestampProvider?.() ?? new Date().toISOString(),
			});
			const stageValidation = validateCardGenerationResponse(proposals);

			if (!stageValidation.valid) {
				return this.result("invalid_response", stageValidation.errors.join(" "));
			}

			const hasTargetMismatch = proposals.some((proposal) => (
				proposal.kind !== "new_card"
				|| proposal.conceptId !== input.conceptId
				|| proposal.payload?.conceptId !== input.conceptId
				|| proposal.payload?.conceptTitle !== input.conceptTitle
			));

			if (hasTargetMismatch) {
				return this.result("invalid_response", "AI Card proposals do not match the current Concept.");
			}

			await this.options.proposalStore.upsertProposals(proposals);
			await this.recordCardGeneration(
				input,
				contentHash,
				learningFingerprint,
				proposals.length === 0 ? "coverage_complete" : "proposed",
				previousGenerationRecord,
			);

			if (proposals.length === 0) {
				return this.result(
					"coverage_complete",
					"Existing Cards already cover the assessable Concept content.",
				);
			}

			return {
				message: proposals.length === 1
					? "1 Card proposal added to Inbox."
					: `${proposals.length} Card proposals added to Inbox.`,
				proposalCount: proposals.length,
				status: "generated",
			};
		} catch (error) {
			return this.result("failed", error instanceof Error ? error.message : String(error));
		}
	}

	private result(status: AiCardGenerationStatus, message: string): AiCardGenerationResult {
		return { message, proposalCount: 0, status };
	}

	private async recordCardGeneration(
		input: AiCardGenerationInput,
		contentHash: string,
		learningFingerprint: string,
		outcome: "proposed" | "coverage_complete",
		previous: SourceAnalysisRecord | undefined,
	): Promise<void> {
		if (!this.options.sourceAnalysisStore) {
			return;
		}

		const now = this.options.timestampProvider?.() ?? new Date().toISOString();
		await this.options.sourceAnalysisStore.upsertRecord({
			contentHash,
			lastAiCaptureHash: previous?.lastAiCaptureHash,
			lastAnalyzedAt: now,
			lastCardGenerationFingerprint: learningFingerprint,
			lastCardGenerationOutcome: outcome,
			lastCardGenerationHash: learningFingerprint,
			linkedConceptIds: previous?.linkedConceptIds ?? [input.conceptId],
			mtime: input.conceptMtime ?? previous?.mtime ?? 0,
			pendingProposalIds: previous?.pendingProposalIds ?? [],
			size: input.conceptSize ?? previous?.size ?? input.markdown.length,
			sourcePath: input.conceptPath,
			status: previous?.status ?? "clean",
		});
	}
}

function normalizeExistingCardFronts(value: string[] | undefined): string[] {
	return [...new Set((value ?? []).map((front) => front.trim()).filter(Boolean))].slice(0, 100);
}
