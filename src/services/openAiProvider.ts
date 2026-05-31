import type { MnemeSettings } from "../models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig, validateAiProviderConfig } from "./aiProvider";

export interface OpenAiStructuredOutputPayload {
	endpoint: string;
	input: Array<{
		content: string;
		role: "system" | "user";
	}>;
	model: string;
	response_format: {
		json_schema: {
			name: "mneme_knowledge_proposals";
			schema: Record<string, unknown>;
			strict: true;
		};
		type: "json_schema";
	};
	timeoutMs: number;
}

export class OpenAiProvider implements AiProvider {
	constructor(private readonly settings: MnemeSettings) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		const validation = validateAiProviderConfig(this.settings);

		if (!validation.valid) {
			throw new Error(validation.errors.join(" "));
		}

		if (this.settings.openaiApiKey.trim().length === 0) {
			throw new Error("OpenAI API key is required to use the OpenAI provider.");
		}

		if (input.mode !== "concept_capture") {
			throw new Error(`Unsupported AI proposal mode: ${input.mode}`);
		}

		buildOpenAiKnowledgeProposalPayload(input, this.settings);

		throw new Error("OpenAI AI capture is an infrastructure shell and is not connected to network execution yet.");
	}
}

export function buildOpenAiKnowledgeProposalPayload(
	input: AiProposalRequest,
	settings: MnemeSettings,
): OpenAiStructuredOutputPayload {
	const sourceContent = input.sourceContent.slice(0, settings.aiMaxInputChars);

	return {
		endpoint: `${settings.openaiBaseUrl.replace(/\/+$/g, "")}/responses`,
		input: [
			{
				content: [
					"You generate Mneme KnowledgeProposal JSON only.",
					"Concept capture may return only new_concept, link_existing_concept, add_view, update_concept, or merge_concept.",
					"Do not return card-stage proposal kinds.",
					"Do not write Markdown.",
				].join("\n"),
				role: "system",
			},
			{
				content: JSON.stringify({
					existingConceptSummaries: input.existingConceptSummaries,
					mode: input.mode,
					sourceContent,
					sourceHash: input.sourceHash,
					sourcePath: input.sourcePath,
				}),
				role: "user",
			},
		],
		model: settings.openaiModel,
		response_format: {
			json_schema: {
				name: "mneme_knowledge_proposals",
				schema: createKnowledgeProposalArrayJsonSchema(),
				strict: true,
			},
			type: "json_schema",
		},
		timeoutMs: settings.aiRequestTimeoutMs,
	};
}

export function createOpenAiProviderDiagnostics(settings: MnemeSettings, sourceContentLength: number): AiProposalResponse["diagnostics"] {
	return {
		inputChars: sourceContentLength,
		logSafeConfig: toLogSafeAiConfig(settings),
		warnings: ["OpenAI provider is a shell; network execution is not enabled in Task 026A."],
	};
}

function createKnowledgeProposalArrayJsonSchema(): Record<string, unknown> {
	return {
		items: {
			additionalProperties: true,
			properties: {
				createdAt: { type: "string" },
				id: { type: "string" },
				kind: {
					enum: [
						"new_concept",
						"link_existing_concept",
						"add_view",
						"update_concept",
						"merge_concept",
					],
					type: "string",
				},
				payload: { type: "object" },
				sourceHash: { type: "string" },
				sourcePath: { type: "string" },
				status: { enum: ["suggested"], type: "string" },
				updatedAt: { type: "string" },
			},
			required: ["id", "kind", "status", "createdAt", "updatedAt"],
			type: "object",
		},
		type: "array",
	};
}
