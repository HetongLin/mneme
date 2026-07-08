import type { MnemeSettings } from "../models/settings";
import { computeContentHash } from "../utils/sourceHash";
import type { AiProvider } from "./aiProvider";
import { validateAiProviderConfig, validateCardGenerationResponse } from "./aiProvider";
import { normalizeAiStructuredProposalResponse } from "./aiProposalNormalizer";
import { validateAiStructuredProposalResponse } from "./aiProposalValidator";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";

const ACTIVE_STATUSES = new Set(["suggested", "opened", "edited", "stale"]);

export interface AiCardGenerationInput {
	conceptId: string;
	conceptPath: string;
	conceptTitle: string;
	markdown: string;
}

export type AiCardGenerationStatus =
	| "ai_disabled"
	| "failed"
	| "generated"
	| "invalid_config"
	| "invalid_response"
	| "skipped_active_proposals";

export interface AiCardGenerationResult {
	message: string;
	proposalCount: number;
	status: AiCardGenerationStatus;
}

export interface AiCardGenerationServiceOptions {
	createProvider: (settings: MnemeSettings) => AiProvider;
	proposalStore: KnowledgeProposalStore;
	settingsProvider: () => MnemeSettings;
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
			const conceptHash = await computeContentHash(input.markdown);
			const existing = await this.options.proposalStore.listBySourcePath(input.conceptPath);
			const hasActiveProposal = existing.some((proposal) => (
				proposal.kind === "new_card"
				&& proposal.sourceHash === conceptHash
				&& ACTIVE_STATUSES.has(proposal.status)
			));

			if (hasActiveProposal) {
				return this.result("skipped_active_proposals", "Card proposals for this Concept are already in Inbox.");
			}

			const provider = this.options.createProvider(settings);
			const response = await provider.generateKnowledgeProposals({
				conceptId: input.conceptId,
				conceptTitle: input.conceptTitle,
				mode: "card_generation",
				sourceContent: input.markdown,
				sourceHash: conceptHash,
				sourcePath: input.conceptPath,
			});
			const validation = validateAiStructuredProposalResponse(response.structuredResponse);

			if (!validation.valid) {
				return this.result("invalid_response", validation.errors.join(" "));
			}

			if (validation.data.mode !== "card_generation") {
				return this.result("invalid_response", "AI response mode does not match Card generation.");
			}

			if (validation.data.source.path !== input.conceptPath || validation.data.source.hash !== conceptHash) {
				return this.result("invalid_response", "AI response source does not match the written Concept.");
			}

			const hasInvalidGrounding = validation.data.proposals.some((proposal) => (
				proposal.evidence.some((evidence) => (
					evidence.sourcePath !== input.conceptPath
						|| !input.markdown.includes(evidence.quote)
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
}
