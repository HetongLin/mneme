import type { AiProposalRequest } from "./aiProvider";
import { AI_CARD_GENERATION_MAX_PROPOSALS } from "./aiProposalSchema";

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
	response_format?: JsonObjectResponseFormat;
	text?: {
		format: ResponsesJsonSchemaFormat;
	};
	timeoutMs: number;
}

interface ResponsesJsonSchemaFormat {
	name: "mneme_knowledge_proposals";
	schema: Record<string, unknown>;
	strict: true;
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
	const systemPrompt = input.mode === "card_generation"
		? [
			"Return one JSON object with schemaVersion 'mneme.ai.proposals.v1', mode 'card_generation', the exact source path/hash, proposals, and string warnings.",
			"Generate at most five non-duplicative new_card proposals from the approved written Concept. Do not propose Concepts or write Markdown.",
			"Every Card must test one independently rateable outcome and include at least one exact quote from the written Concept as grounding evidence.",
			"Every proposal requires kind 'new_card', title, rationale, confidence from 0 to 1, evidence entries with sourcePath/quote/explanation, and payload.",
			"The payload requires conceptId, conceptTitle, front, back, rubric, and cardType.",
			"Use focused recall questions that test understanding, distinctions, procedures, examples, traps, proofs, applications, or mastery. Avoid trivia and duplicate questions.",
		].join("\n")
		: [
			"Return one JSON object with schemaVersion 'mneme.ai.proposals.v1', mode 'concept_capture', the exact source path/hash, proposals, and string warnings.",
			"Concept capture may return only new_concept, link_existing_concept, add_view, update_concept, or merge_concept.",
			"Every proposal requires kind, title, rationale, confidence from 0 to 1, evidence entries with sourcePath/quote/explanation, and a kind-specific payload.",
			"Payloads: new_concept={conceptTitle,summary,coreMeaning,learningMode,suggestedImportance,relatedConceptHints,views[{title,body}]}; link_existing_concept={existingConceptId,existingConceptTitle,reason}; add_view={targetConceptId,targetConceptTitle,viewTitle,viewBody}; update_concept={targetConceptId,targetConceptTitle,reason,proposedSummary and/or proposedCoreMeaning}; merge_concept={sourceConceptIds,proposedTitle,reason}.",
			"Never return new_card, revise_card, split_card, merge_card, or retire_card.",
			"Do not write Markdown.",
		].join("\n");
	const requestContext = input.mode === "card_generation"
		? {
			conceptId: input.conceptId,
			conceptTitle: input.conceptTitle,
			mode: input.mode,
			sourceContent,
			sourceHash: input.sourceHash,
			sourcePath: input.sourcePath,
		}
		: {
			existingConceptSummaries: input.existingConceptSummaries,
			mode: input.mode,
			sourceContent,
			sourceHash: input.sourceHash,
			sourcePath: input.sourcePath,
		};
	const messages = [
		{
			content: systemPrompt,
			role: "system" as const,
		},
		{
			content: JSON.stringify(requestContext),
			role: "user" as const,
		},
	];

	const payload: OpenAiCompatibleStructuredOutputPayload = {
		endpoint: `${config.baseUrl.replace(/\/+$/g, "")}/${config.endpointPath}`,
		model: config.model,
		timeoutMs: config.timeoutMs,
	};

	if (config.requestShape === "responses") {
		payload.input = messages;
		payload.text = { format: createResponsesFormat(input.mode) };
	} else {
		payload.messages = messages;
		payload.response_format = { type: "json_object" };
	}

	return payload;
}

function createResponsesFormat(mode: AiProposalRequest["mode"]): ResponsesJsonSchemaFormat {
	return {
		name: "mneme_knowledge_proposals",
		schema: mode === "card_generation"
			? createCardGenerationResponseJsonSchema()
			: createKnowledgeProposalResponseJsonSchema(),
		strict: true,
		type: "json_schema",
	};
}

function createCardGenerationResponseJsonSchema(): Record<string, unknown> {
	const evidence = {
		additionalProperties: false,
		properties: {
			explanation: { type: "string" },
			quote: { type: "string" },
			sourcePath: { type: "string" },
		},
		required: ["explanation", "quote", "sourcePath"],
		type: "object",
	};
	const cardProposal = {
		additionalProperties: false,
		properties: {
			confidence: { maximum: 1, minimum: 0, type: "number" },
			evidence: { items: evidence, type: "array" },
			kind: { const: "new_card", type: "string" },
			payload: {
				additionalProperties: false,
				properties: {
					back: { type: "string" },
					cardType: { enum: ["definition", "distinction", "procedure", "example", "trap", "proof", "application", "mastery", "other"], type: "string" },
					conceptId: { type: "string" },
					conceptTitle: { type: "string" },
					front: { type: "string" },
					rubric: { type: "string" },
				},
				required: ["back", "cardType", "conceptId", "conceptTitle", "front", "rubric"],
				type: "object",
			},
			rationale: { type: "string" },
			title: { type: "string" },
		},
		required: ["confidence", "evidence", "kind", "payload", "rationale", "title"],
		type: "object",
	};

	return {
		additionalProperties: false,
		properties: {
			mode: { const: "card_generation", type: "string" },
			proposals: { items: cardProposal, maxItems: AI_CARD_GENERATION_MAX_PROPOSALS, type: "array" },
			schemaVersion: { const: "mneme.ai.proposals.v1", type: "string" },
			source: {
				additionalProperties: false,
				properties: { hash: { type: "string" }, path: { type: "string" } },
				required: ["hash", "path"],
				type: "object",
			},
			warnings: { items: { type: "string" }, type: "array" },
		},
		required: ["mode", "proposals", "schemaVersion", "source", "warnings"],
		type: "object",
	};
}

function createKnowledgeProposalResponseJsonSchema(): Record<string, unknown> {
	const evidence = {
		additionalProperties: false,
		properties: {
			explanation: { type: "string" },
			quote: { type: "string" },
			sourcePath: { type: "string" },
		},
		required: ["explanation", "quote", "sourcePath"],
		type: "object",
	};
	const proposalBase = {
		confidence: { maximum: 1, minimum: 0, type: "number" },
		evidence: { items: evidence, type: "array" },
		rationale: { type: "string" },
		title: { type: "string" },
	};
	const proposal = (kind: string, payload: Record<string, unknown>, required: string[]) => ({
		additionalProperties: false,
		properties: {
			...proposalBase,
			kind: { const: kind, type: "string" },
			payload: {
				additionalProperties: false,
				properties: payload,
				required,
				type: "object",
			},
		},
		required: ["confidence", "evidence", "kind", "payload", "rationale", "title"],
		type: "object",
	});

	return {
		additionalProperties: false,
		properties: {
			mode: { const: "concept_capture", type: "string" },
			proposals: {
				items: {
					anyOf: [
						proposal("new_concept", {
							conceptTitle: { type: "string" },
							coreMeaning: { type: "string" },
							learningMode: { enum: ["reviewable", "exploratory"], type: "string" },
							relatedConceptHints: { items: { type: "string" }, type: "array" },
							suggestedImportance: { enum: ["low", "normal", "high", "critical"], type: "string" },
							summary: { type: "string" },
							views: {
								items: {
									additionalProperties: false,
									properties: { body: { type: "string" }, title: { type: "string" } },
									required: ["body", "title"],
									type: "object",
								},
								type: "array",
							},
						}, ["conceptTitle", "coreMeaning", "learningMode", "relatedConceptHints", "suggestedImportance", "summary", "views"]),
						proposal("link_existing_concept", {
							existingConceptId: { type: "string" },
							existingConceptTitle: { type: "string" },
							reason: { type: "string" },
						}, ["existingConceptId", "existingConceptTitle", "reason"]),
						proposal("add_view", {
							targetConceptId: { type: "string" },
							targetConceptTitle: { type: "string" },
							viewBody: { type: "string" },
							viewTitle: { type: "string" },
						}, ["targetConceptId", "targetConceptTitle", "viewBody", "viewTitle"]),
						proposal("update_concept", {
							proposedCoreMeaning: { type: "string" },
							proposedSummary: { type: "string" },
							reason: { type: "string" },
							targetConceptId: { type: "string" },
							targetConceptTitle: { type: "string" },
						}, ["proposedCoreMeaning", "proposedSummary", "reason", "targetConceptId", "targetConceptTitle"]),
						proposal("merge_concept", {
							proposedTitle: { type: "string" },
							reason: { type: "string" },
							sourceConceptIds: { items: { type: "string" }, minItems: 2, type: "array" },
						}, ["proposedTitle", "reason", "sourceConceptIds"]),
					],
				},
				type: "array",
			},
			schemaVersion: { const: "mneme.ai.proposals.v1", type: "string" },
			source: {
				additionalProperties: false,
				properties: { hash: { type: "string" }, path: { type: "string" } },
				required: ["hash", "path"],
				type: "object",
			},
			warnings: { items: { type: "string" }, type: "array" },
		},
		required: ["mode", "proposals", "schemaVersion", "source", "warnings"],
		type: "object",
	};
}
