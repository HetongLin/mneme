import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { MnemeSettings } from "../models/settings";
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
		const now = "2026-01-01T00:00:00.000Z";
		const proposal: KnowledgeProposal = {
			createdAt: now,
			id: `mock-concept-${stableSlug(input.sourcePath)}-${input.sourceHash.slice(0, 8) || "source"}`,
			kind: "new_concept",
			payload: {
				coreMeaning: `Review the central idea from ${input.sourcePath}.`,
				learningMode: "reviewable",
				proposedSourceLinks: [{
					relationType: "origin",
					sourceHash: input.sourceHash,
					sourcePath: input.sourcePath,
				}],
				suggestedImportance: "normal",
				summary: `Mock concept proposal for ${input.sourcePath}.`,
				title,
			},
			sourceHash: input.sourceHash,
			sourcePath: input.sourcePath,
			status: "suggested",
			updatedAt: now,
		};

		return {
			diagnostics: {
				inputChars: input.sourceContent.length,
				logSafeConfig: toLogSafeAiConfig(this.settings),
				warnings: ["Mock AI provider returned deterministic concept-stage proposals."],
			},
			proposals: [proposal],
			provider: {
				provider: "mock",
				structuredOutput: "mock",
			},
		};
	}
}

function buildMockTitle(sourcePath: string): string {
	const fileName = sourcePath.split("/").filter(Boolean).pop() ?? "Source Note";
	const withoutExtension = fileName.replace(/\.md$/i, "").trim();

	return withoutExtension ? `Concept from ${withoutExtension}` : "Concept from Source Note";
}

function stableSlug(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || "source";
}
