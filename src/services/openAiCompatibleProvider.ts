import type { AiProposalRequest } from "./aiProvider";

export interface OpenAiCompatibleProviderConfig {
	baseUrl: string;
	endpointPath: "responses" | "chat/completions";
	maxInputChars: number;
	model: string;
	requestShape: "responses" | "chat_completions";
	timeoutMs: number;
}

export interface OpenAiCompatibleStructuredOutputPayload {
	endpoint: string;
	input?: Array<{
		content: string;
		role: "system" | "user";
	}>;
	messages?: Array<{
		content: string;
		role: "system" | "user";
	}>;
	model: string;
	response_format: JsonSchemaResponseFormat | JsonObjectResponseFormat;
	timeoutMs: number;
}

interface JsonSchemaResponseFormat {
	json_schema: {
		name: "mneme_knowledge_proposals";
		schema: Record<string, unknown>;
		strict: true;
	};
	type: "json_schema";
}

interface JsonObjectResponseFormat {
	type: "json_object";
}

export function buildOpenAiCompatibleKnowledgeProposalPayload(
	input: AiProposalRequest,
	config: OpenAiCompatibleProviderConfig,
): OpenAiCompatibleStructuredOutputPayload {
	const sourceContent = input.sourceContent.slice(0, config.maxInputChars);
	const messages = [
		{
			content: [
				"You generate Mneme KnowledgeProposal JSON only.",
				"Concept capture may return only new_concept, link_existing_concept, add_view, update_concept, or merge_concept.",
				"Do not return card-stage proposal kinds.",
				"Do not write Markdown.",
			].join("\n"),
			role: "system" as const,
		},
		{
			content: JSON.stringify({
				existingConceptSummaries: input.existingConceptSummaries,
				mode: input.mode,
				sourceContent,
				sourceHash: input.sourceHash,
				sourcePath: input.sourcePath,
			}),
			role: "user" as const,
		},
	];

	const payload: OpenAiCompatibleStructuredOutputPayload = {
		endpoint: `${config.baseUrl.replace(/\/+$/g, "")}/${config.endpointPath}`,
		model: config.model,
		response_format: createResponseFormat(config.requestShape),
		timeoutMs: config.timeoutMs,
	};

	if (config.requestShape === "responses") {
		payload.input = messages;
	} else {
		payload.messages = messages;
	}

	return payload;
}

function createResponseFormat(shape: OpenAiCompatibleProviderConfig["requestShape"]): JsonSchemaResponseFormat | JsonObjectResponseFormat {
	if (shape === "chat_completions") {
		return { type: "json_object" };
	}

	return {
		json_schema: {
			name: "mneme_knowledge_proposals",
			schema: createKnowledgeProposalArrayJsonSchema(),
			strict: true,
		},
		type: "json_schema",
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
