import type { CardDraftType, KnowledgeProposal } from "../models/knowledgeProposal";
import type { MnemeSettings } from "../models/settings";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { computeContentHash } from "../utils/sourceHash";
import type { AiProposalResponse, AiProvider } from "./aiProvider";
import { createAiCardGenerationFingerprint } from "./aiCaptureFingerprint";
import type { AiGenerationLock } from "./aiGenerationLock";
import type { AiOperationProgress, AiOperationProgressListener } from "./aiOperationProgress";
import { reportAiOperationProgress } from "./aiOperationProgress";
import { validateAiProviderConfig, validateCardGenerationResponse } from "./aiProvider";
import { normalizeAiStructuredProposalResponse } from "./aiProposalNormalizer";
import { AI_PROPOSAL_SCHEMA_VERSION, type AiCardGenerationResponseV1 } from "./aiProposalSchema";
import { validateAiStructuredProposalResponse } from "./aiProposalValidator";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";
import { extractConceptLearningContent } from "./conceptLearningContent";
import { createRandomCardId } from "./entityId";
import { reconcileCardGrounding } from "./proposalGroundingReconciler";
import { splitSourceForAiCapture } from "./sourceCaptureChunker";

const ACTIVE_STATUSES = new Set(["suggested", "opened", "edited", "stale", "approved"]);

export interface AiCardGenerationInput {
	conceptId: string;
	conceptMtime?: number;
	conceptPath: string;
	conceptSize?: number;
	conceptTitle: string;
	existingCardFronts?: string[];
	existingCardTypes?: CardDraftType[];
	markdown: string;
}

export type AiCardGenerationStatus =
	| "ai_disabled"
	| "coverage_complete"
	| "failed"
	| "generation_in_progress"
	| "generated"
	| "invalid_config"
	| "invalid_response"
	| "skipped_active_proposals"
	| "skipped_unchanged_concept";

export interface AiCardGenerationResult {
	message: string;
	proposalCount: number;
	proposalIds: string[];
	status: AiCardGenerationStatus;
}

export interface AiCardGenerationServiceOptions {
	cardIdFactory?: () => string;
	createProvider: (settings: MnemeSettings) => AiProvider;
	generationLock: AiGenerationLock;
	onProgress?: AiOperationProgressListener;
	proposalStore: KnowledgeProposalStore;
	settingsProvider: () => MnemeSettings;
	sourceAnalysisStore?: SourceAnalysisStore;
	timestampProvider?: () => string;
}

export class AiCardGenerationService {
	constructor(private readonly options: AiCardGenerationServiceOptions) {
	}

	async generate(input: AiCardGenerationInput): Promise<AiCardGenerationResult> {
		const lease = this.options.generationLock.tryAcquire("card_generation", input.conceptPath);

		if (!lease) {
			return this.result(
				"generation_in_progress",
				"Card generation is already in progress for this Concept. Wait for the current request to finish.",
			);
		}

		try {
			return await this.generateWithLock(input);
		} finally {
			lease.release();
		}
	}

	private async generateWithLock(input: AiCardGenerationInput): Promise<AiCardGenerationResult> {
		this.reportProgress("preparing", "Preparing written Concept…");
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
			const generationFingerprint = await createAiCardGenerationFingerprint(
				learningFingerprint,
				input.conceptPath,
				settings,
			);
			const contentHash = await computeContentHash(input.markdown);
			const existing = await this.options.proposalStore.listBySourcePath(input.conceptPath);
			const activeProposals = existing.filter((proposal) => (
				proposal.kind === "new_card"
					&& proposal.sourceHash === learningFingerprint
					&& ACTIVE_STATUSES.has(proposal.status)
			));

			if (activeProposals.length > 0) {
				return this.result(
					"skipped_active_proposals",
					"Card proposals for this Concept are already in Inbox.",
					activeProposals.map((proposal) => proposal.id),
				);
			}

			const previousGenerationRecord = await this.options.sourceAnalysisStore?.getRecord(input.conceptPath);
			const previousFingerprint = previousGenerationRecord?.lastCardGenerationFingerprint
				?? previousGenerationRecord?.lastCardGenerationHash;
			if (previousFingerprint === generationFingerprint) {
				return this.result(
					"skipped_unchanged_concept",
					"No new assessable Concept content is available for Card generation.",
				);
			}

			const provider = this.options.createProvider(settings);
			const chunks = splitSourceForAiCapture(learningContent, settings.aiMaxInputChars);
			const chunkResponses: AiCardGenerationResponseV1[] = [];
			const generatedFronts: string[] = [];
			const generatedCardTypes: CardDraftType[] = [];
			const definitionRequired = settings.allowedAiCardTypes.includes("definition")
				&& !(input.existingCardTypes ?? []).includes("definition");
			let rawProposalCount = 0;

			for (const chunk of chunks) {
				const chunkPrefix = chunks.length > 1 ? `Chunk ${chunk.index}/${chunk.total}: ` : "";
				let response: AiProposalResponse;

				try {
					this.reportProgress(
						"requesting",
						chunks.length === 1
							? "Waiting for AI response…"
							: `Waiting for AI response (${chunk.index}/${chunk.total})…`,
					);
					response = await provider.generateKnowledgeProposals({
						conceptId: input.conceptId,
						conceptTitle: input.conceptTitle,
						definitionRequired: definitionRequired && !generatedCardTypes.includes("definition"),
						existingCardFronts: normalizeExistingCardFronts([
							...(input.existingCardFronts ?? []),
							...generatedFronts,
						]),
						mode: "card_generation",
						sourceContent: chunk.content,
						sourceHash: learningFingerprint,
						sourcePath: input.conceptPath,
					});
				} catch (error) {
					return this.result(
						"failed",
						`${chunkPrefix}${error instanceof Error ? error.message : String(error)}`,
					);
				}

				this.reportProgress("validating", "Validating AI response…");
				const validation = validateAiStructuredProposalResponse(response.structuredResponse);

				if (!validation.valid) {
					return this.result("invalid_response", `${chunkPrefix}${validation.errors.join(" ")}`);
				}

				if (validation.data.mode !== "card_generation") {
					return this.result("invalid_response", `${chunkPrefix}AI response mode does not match Card generation.`);
				}

				if (validation.data.source.path !== input.conceptPath || validation.data.source.hash !== learningFingerprint) {
					return this.result("invalid_response", `${chunkPrefix}AI response source does not match the written Concept.`);
				}

				rawProposalCount += validation.data.proposals.length;
				const grounding = reconcileCardGrounding(
					validation.data,
					learningContent,
					input.conceptPath,
				);

				if (validation.data.proposals.length > 0 && grounding.response.proposals.length === 0) {
					chunkResponses.push({
						...grounding.response,
						warnings: [
							...grounding.response.warnings,
							`${chunkPrefix}Mneme ignored ungrounded Card proposals from this chunk and continued generating Cards.`,
						],
					});
					continue;
				}

				generatedFronts.push(...grounding.response.proposals.map((proposal) => proposal.payload.front));
				generatedCardTypes.push(...grounding.response.proposals.map((proposal) => proposal.payload.cardType));
				chunkResponses.push(grounding.response);
			}

			const analyzedChars = chunks.reduce((total, chunk) => total + chunk.content.length, 0);
			const aggregatedResponse: AiCardGenerationResponseV1 = {
				mode: "card_generation",
				proposals: chunkResponses.flatMap((response) => response.proposals),
				schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
				source: { hash: learningFingerprint, path: input.conceptPath },
				warnings: unique([
					...chunkResponses.flatMap((response) => response.warnings),
					`Mneme analyzed ${analyzedChars}/${learningContent.length} approved Concept characters across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`,
				]),
			};

			if (rawProposalCount > 0 && aggregatedResponse.proposals.length === 0) {
				return this.result(
					"invalid_response",
					`AI returned ${formatCardProposalCount(rawProposalCount)} without verifiable approved Concept quotes. No Card proposals added.`,
				);
			}

			if (
				definitionRequired
				&& !aggregatedResponse.proposals.some((proposal) => proposal.payload.cardType === "definition")
			) {
				return this.result(
					"invalid_response",
					"Definition is enabled and this Concept has no Definition Card, but AI did not return one. No Card proposals added.",
				);
			}

			const proposals = assignRandomCardProposalIds(normalizeAiStructuredProposalResponse(aggregatedResponse, {
				idFactory: (_proposal, index) => [
					"ai-card-proposal",
					learningFingerprint.slice(0, 12),
					generationFingerprint.slice(0, 12),
					index + 1,
				].join("-"),
				now: this.options.timestampProvider?.() ?? new Date().toISOString(),
			}), this.options.cardIdFactory);
			const stageValidation = validateCardGenerationResponse(proposals);

			if (!stageValidation.valid) {
				return this.result("invalid_response", stageValidation.errors.join(" "));
			}

			const disabledCardType = proposals
				.map((proposal) => getGeneratedCardType(proposal))
				.find((cardType) => cardType !== undefined && !settings.allowedAiCardTypes.includes(cardType));

			if (disabledCardType) {
				return this.result("invalid_response", `AI returned disabled cardType '${disabledCardType}'.`);
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

			this.reportProgress("saving", "Saving Card proposals…");
			await this.options.proposalStore.upsertProposals(proposals);
			await this.recordCardGeneration(
				input,
				contentHash,
				generationFingerprint,
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
					? `1 Card proposal added to Inbox. Analyzed ${analyzedChars}/${learningContent.length} approved Concept characters across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`
					: `${proposals.length} Card proposals added to Inbox. Analyzed ${analyzedChars}/${learningContent.length} approved Concept characters across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`,
				proposalCount: proposals.length,
				proposalIds: proposals.map((proposal) => proposal.id),
				status: "generated",
			};
		} catch (error) {
			return this.result("failed", error instanceof Error ? error.message : String(error));
		}
	}

	private result(
		status: AiCardGenerationStatus,
		message: string,
		proposalIds: string[] = [],
	): AiCardGenerationResult {
		return { message, proposalCount: 0, proposalIds, status };
	}

	private reportProgress(stage: AiOperationProgress["stage"], message: string): void {
		reportAiOperationProgress(this.options.onProgress, stage, message);
	}

	private async recordCardGeneration(
		input: AiCardGenerationInput,
		contentHash: string,
		generationFingerprint: string,
		outcome: "proposed" | "coverage_complete",
		previous: SourceAnalysisRecord | undefined,
	): Promise<void> {
		if (!this.options.sourceAnalysisStore) {
			return;
		}

		const now = this.options.timestampProvider?.() ?? new Date().toISOString();
		await this.options.sourceAnalysisStore.upsertRecord({
			contentHash,
			lastAiCaptureAnalyzedChars: previous?.lastAiCaptureAnalyzedChars,
			lastAiCaptureChunkCount: previous?.lastAiCaptureChunkCount,
			lastAiCaptureFingerprint: previous?.lastAiCaptureFingerprint,
			lastAiCaptureTotalChars: previous?.lastAiCaptureTotalChars,
			lastAnalyzedAt: now,
			lastCardGenerationFingerprint: generationFingerprint,
			lastCardGenerationOutcome: outcome,
			lastCardGenerationHash: generationFingerprint,
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

function getGeneratedCardType(proposal: KnowledgeProposal): CardDraftType | undefined {
	return proposal.kind === "new_card" ? proposal.payload?.card.cardType : undefined;
}

function assignRandomCardProposalIds(
	proposals: KnowledgeProposal[],
	cardIdFactory: () => string = createRandomCardId,
): KnowledgeProposal[] {
	const reservedIds = new Set<string>();

	return proposals.map((proposal) => {
		if (proposal.kind !== "new_card") {
			return proposal;
		}

		let cardId = cardIdFactory();
		let attempts = 1;
		while (reservedIds.has(cardId) && attempts < 128) {
			cardId = cardIdFactory();
			attempts += 1;
		}
		if (reservedIds.has(cardId)) {
			throw new Error("Unable to allocate a unique random Card ID.");
		}
		reservedIds.add(cardId);

		return { ...proposal, cardId };
	});
}

function unique(values: string[]): string[] {
	return [...new Set(values)];
}

function formatCardProposalCount(proposalCount: number): string {
	return proposalCount === 1 ? "1 Card proposal" : `${proposalCount} Card proposals`;
}
