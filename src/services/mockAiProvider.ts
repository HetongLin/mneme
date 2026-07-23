import type { MnemeSettings } from "../models/settings";
import { AI_PROPOSAL_SCHEMA_VERSION } from "./aiProposalSchema";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig } from "./aiProvider";

export class MockAiProvider implements AiProvider {
	constructor(private readonly settings: MnemeSettings) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		if (input.mode === "card_generation") {
			return this.generateCardProposal(input);
		}

		const title = buildMockTitle(input.sourcePath);
		return {
			diagnostics: {
				inputChars: input.sourceContent.length,
				logSafeConfig: toLogSafeAiConfig(this.settings),
				warnings: ["Mock AI provider returned deterministic concept-stage proposals."],
			},
			provider: {
				provider: "mock",
				structuredOutput: "mock",
			},
			structuredResponse: {
				mode: "concept_capture",
				proposals: [{
					confidence: 1,
					evidence: [{
						explanation: "Mock provider uses the supplied source note as deterministic test evidence.",
						quote: input.sourceContent.slice(0, 240) || `Source content from ${input.sourcePath}.`,
						sourcePath: input.sourcePath,
					}],
					kind: "new_concept",
					payload: {
						conceptTitle: title,
						coreMeaning: `Review the central idea from ${input.sourcePath}.`,
						englishName: title,
						whyItMatters: `Use this Concept to review knowledge from ${input.sourcePath}.`,
						learningMode: "reviewable",
						relatedConceptHints: [],
						suggestedImportance: "normal",
						tags: ["mock", "source-note"],
						views: [],
					},
					rationale: "Deterministic mock proposal for offline tests.",
					title,
				}],
				schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
				source: {
					hash: input.sourceHash,
					path: input.sourcePath,
				},
				warnings: ["Mock AI provider returned deterministic concept-stage proposals."],
			},
		};
	}

	private generateCardProposal(input: AiProposalRequest & { mode: "card_generation" }): AiProposalResponse {
		const warnings = ["Mock AI provider returned deterministic card-stage proposals."];
		const cardType = this.settings.allowedAiCardTypes[0] ?? "definition";

		return {
			diagnostics: {
				inputChars: input.sourceContent.length,
				logSafeConfig: toLogSafeAiConfig(this.settings),
				warnings,
			},
			provider: {
				provider: "mock",
				structuredOutput: "mock",
			},
			structuredResponse: {
				mode: "card_generation",
				proposals: [{
					confidence: 1,
					evidence: [{
						explanation: "Mock provider uses the written Concept as deterministic test evidence.",
						quote: input.sourceContent.slice(0, 240) || `Concept content from ${input.sourcePath}.`,
						sourcePath: input.sourcePath,
					}],
					kind: "new_card",
					payload: {
						back: `Explain the core meaning of ${input.conceptTitle} in your own words.`,
						cardType,
						conceptId: input.conceptId,
						conceptTitle: input.conceptTitle,
						front: `What is the core meaning of ${input.conceptTitle}?`,
						rubric: "States the core meaning and one important distinction or consequence.",
					},
					rationale: "Deterministic mock Card generated from an approved Concept.",
					title: `${input.conceptTitle} core meaning`,
				}],
				schemaVersion: AI_PROPOSAL_SCHEMA_VERSION,
				source: {
					hash: input.sourceHash,
					path: input.sourcePath,
				},
				warnings,
			},
		};
	}
}

function buildMockTitle(sourcePath: string): string {
	const fileName = sourcePath.split("/").filter(Boolean).pop() ?? "Source Note";
	const withoutExtension = fileName.replace(/\.md$/i, "").trim();

	return withoutExtension ? `Concept from ${withoutExtension}` : "Concept from Source Note";
}
