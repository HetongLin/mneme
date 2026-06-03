import type { MnemeSettings } from "../models/settings";
import { AI_PROPOSAL_SCHEMA_VERSION } from "./aiProposalSchema";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig } from "./aiProvider";

export class MockAiProvider implements AiProvider {
	constructor(private readonly settings: MnemeSettings) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		if (input.mode !== "concept_capture") {
			throw new Error(`Unsupported AI proposal mode: ${input.mode}`);
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
						learningMode: "reviewable",
						relatedConceptHints: [],
						suggestedImportance: "normal",
						summary: `Mock concept proposal for ${input.sourcePath}.`,
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
}

function buildMockTitle(sourcePath: string): string {
	const fileName = sourcePath.split("/").filter(Boolean).pop() ?? "Source Note";
	const withoutExtension = fileName.replace(/\.md$/i, "").trim();

	return withoutExtension ? `Concept from ${withoutExtension}` : "Concept from Source Note";
}
