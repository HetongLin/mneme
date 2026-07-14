import type { AiProposalRequest } from "./aiProvider";
import { AI_CARD_GENERATION_MAX_PROPOSALS } from "./aiProposalSchema";
import { createLearningContentLanguageContract } from "./learningContentLanguage";

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

const OBSIDIAN_MATH_MARKDOWN_GUIDANCE = [
	"Format mathematical notation in generated user-facing content as Obsidian MathJax Markdown.",
	"Use $...$ for short inline math that belongs inside a sentence, for example $P(A \\mid B)$.",
	"Use $$...$$ on separate lines for a standalone, long, emphasized, or multi-line equation, for example:\n$$\nP(A \\mid B)=\\frac{P(B \\mid A)P(A)}{P(B)}\n$$",
	"Never emit bare LaTeX, \\(...\\), \\[...\\], or fenced code blocks for formulas, and do not put spaces immediately inside math delimiters.",
	"Because the response is JSON, encode LaTeX backslashes as valid JSON escapes. Do not alter exact evidence quotes to add math delimiters.",
	"These delimiter rules are mandatory whenever generated payload text contains mathematical notation. Before returning JSON, inspect every user-facing payload string and fix any formula-like expression left outside math delimiters.",
	"If the source uses $...$ or $$...$$, preserve valid delimiters when carrying that mathematics into generated content. Write 'Bayes theorem uses $P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}$' rather than leaving P(h|D) or the equation as bare text.",
].join(" ");

const LANGUAGE_CONTRACT_GUIDANCE = [
	"The user JSON contains a languageContract computed by Mneme from sourceContent. Treat it as authoritative.",
	"A response that violates languageContract is invalid. Before returning JSON, verify every generated learning field against it.",
	"Apply languageContract to every AI-authored natural-language field, including proposal titles, rationales, evidence explanations, new Concept titles, Core Meaning, Why It Matters, View titles and bodies, and Card fronts, backs, and rubrics.",
	"Do not infer or change the output language based on existingConcepts, existing Concept titles, existingCardFronts, UI language, tags, filenames, or examples elsewhere in this prompt.",
	"Exact evidence quotes and copied identifiers or existing target titles are exempt: preserve them exactly and never translate them.",
].join(" ");

export function buildOpenAiCompatibleKnowledgeProposalPayload(
	input: AiProposalRequest,
	config: OpenAiCompatibleProviderConfig,
): OpenAiCompatibleStructuredOutputPayload {
	const sourceContent = input.sourceContent.slice(0, config.maxInputChars);
	const languageContract = createLearningContentLanguageContract(input.sourceContent);
	const formattingContract = {
		mathMarkdown: "Required: wrap inline mathematics in $...$ with no spaces immediately inside the delimiters, and standalone mathematics in $$...$$; never return bare formulas in generated payload text.",
	};
	const systemPrompt = input.mode === "card_generation"
		? [
			"Return one JSON object with schemaVersion 'mneme.ai.proposals.v1', mode 'card_generation', the exact source path/hash, proposals, and string warnings.",
			"Copy sourcePath exactly into source.path and sourceHash exactly into source.hash from the user JSON. Do not invent, shorten, or rehash either value.",
			LANGUAGE_CONTRACT_GUIDANCE,
			"Top-level shape: {\"schemaVersion\":\"mneme.ai.proposals.v1\",\"mode\":\"card_generation\",\"source\":{\"path\":\"<sourcePath>\",\"hash\":\"<sourceHash>\"},\"warnings\":[],\"proposals\":[]}.",
			"Generate at most five non-duplicative new_card proposals from the approved written Concept. Do not propose Concepts or return a standalone Markdown document.",
			"Treat existingCardFronts as the current Coverage Map. Do not repeat the same learning outcome; return an empty proposals array when the approved Concept has no useful uncovered outcome.",
			"Every Card must test one independently rateable outcome and include at least one exact quote from the written Concept as grounding evidence.",
			"Every proposal requires kind 'new_card', title, rationale, confidence from 0 to 1, evidence entries with sourcePath/quote/explanation, and payload.",
			"The payload requires conceptId, conceptTitle, front, back, rubric, and cardType.",
			"cardType must be exactly one of: definition, distinction, procedure, example, trap, proof, application, mastery, other. Use 'other' when unsure.",
			"Choose cardType by this rubric: definition=asks what the Concept means; distinction=compares or contrasts Concepts; procedure=asks for steps, calculation, or method; example=asks to interpret a concrete case; trap=asks about a misconception or common error; proof=asks for derivation, justification, or theorem logic; application=asks how to use the Concept in a new situation; mastery=asks for synthesis across multiple ideas; other=only if none fit.",
			"Return the exact cardType enum value only, not a natural-language label, phrase, or explanation.",
			"Use focused recall questions that test understanding, distinctions, procedures, examples, traps, proofs, applications, or mastery. Avoid trivia and duplicate questions.",
			OBSIDIAN_MATH_MARKDOWN_GUIDANCE,
			"Follow languageContract exactly for generated Card text. Evidence quotes must stay exact and must not be translated.",
		].join("\n")
		: [
			"Return one JSON object with schemaVersion 'mneme.ai.proposals.v1', mode 'concept_capture', the exact source path/hash, proposals, and string warnings.",
			"Copy sourcePath exactly into source.path and sourceHash exactly into source.hash from the user JSON. Do not invent, shorten, or rehash either value.",
			LANGUAGE_CONTRACT_GUIDANCE,
			"Top-level shape: {\"schemaVersion\":\"mneme.ai.proposals.v1\",\"mode\":\"concept_capture\",\"source\":{\"path\":\"<sourcePath>\",\"hash\":\"<sourceHash>\"},\"warnings\":[],\"proposals\":[]}.",
			"Concept capture may return only new_concept, link_existing_concept, add_view, update_concept, or merge_concept.",
			"Do not apply a fixed numerical cap to Concept proposals. Cover every durable knowledge change warranted by the Source Note, while preferring no proposal over a weak one.",
			"Every proposal requires kind, title, rationale, confidence from 0 to 1, at least one evidence entry with sourcePath/quote/explanation, and a kind-specific payload. Each evidence quote must be an exact, non-empty excerpt from sourceContent and sourcePath must exactly equal the supplied sourcePath.",
			"Payloads: new_concept={conceptTitle,coreMeaning,whyItMatters,learningMode,suggestedImportance,tags,relatedConceptHints,views[{title,body}]}; link_existing_concept={existingConceptId,existingConceptTitle,reason}; add_view={targetConceptId,targetConceptTitle,viewTitle,viewBody}; update_concept={targetConceptId,targetConceptTitle,reason,proposedCoreMeaning and/or proposedWhyItMatters}; merge_concept={sourceConceptIds,proposedTitle,reason}.",
			"A new_concept must represent exactly one independently explainable, durable knowledge unit that remains useful beyond the current note and is coherent enough to review or build on later.",
			"Do not create a Concept from a section heading, organizational label, isolated fact, incidental example, anecdote, background sentence, or repeated paraphrase. Treat examples as evidence or supporting Views unless they express a reusable general concept.",
			"Use the shortest unambiguous canonical or established Concept name for new_concept proposal.title and payload.conceptTitle, and for merge_concept payload.proposedTitle. Name the knowledge itself, not the Source Note's purpose, application context, domain, tool, course, or lesson wording.",
			"Do not append contextual qualifiers such as 'for Hypothesis Evaluation', 'in Healthcare', or 'using Python' unless the full phrase is itself the established name of a genuinely distinct Concept. Prefer 'Bayes Theorem' over 'Bayes Theorem for Hypothesis Evaluation'.",
			"Put an application context in whyItMatters or a View. When the canonical Concept already exists, represent a useful contextual perspective with add_view, update_concept, or link_existing_concept instead of creating a context-qualified duplicate.",
			"Compare each candidate with existingConcepts before creating it. Prefer link_existing_concept for the same Concept, update_concept when the source improves its meaning, add_view when the source adds a useful perspective, and merge_concept for redundant existing Concepts. Use new_concept only for a genuinely distinct durable knowledge unit.",
			"Return an empty proposals array when the Source Note contains no durable knowledge worth creating or linking and no meaningful change to an existing Concept.",
			"For new_concept payloads, coreMeaning is the compact primary learning content: state what the Concept is and its defining mechanism clearly enough to identify it, without unnecessary background or examples. whyItMatters states only why it is useful, when it matters, or what problem it helps solve. Do not use whyItMatters to repeat or paraphrase coreMeaning.",
			"For update_concept payloads, proposedCoreMeaning and proposedWhyItMatters follow the same distinction: proposedCoreMeaning explains what the Concept is; proposedWhyItMatters explains its usefulness, relevance, or application.",
			OBSIDIAN_MATH_MARKDOWN_GUIDANCE,
			"Follow languageContract exactly for generated Concept text. Evidence quotes must stay exact and must not be translated.",
			"For new_concept payloads, learningMode must be exactly 'reviewable' or 'exploratory'; do not use values like definition, application, recall, or understanding.",
			"For new_concept payloads, suggestedImportance must be exactly 'low', 'normal', 'high', or 'critical'; use 'normal' when unsure.",
			"For new_concept payloads, suggest 1 to 5 concise organization tags. Prefer stable English lowercase slugs, but preserve an established non-English domain tag when it clearly matches the student's note; do not duplicate meanings or include '#' prefixes.",
			"For new_concept payloads, views is optional supporting perspective data: return [] unless every view has both a non-empty title and a non-empty body. Never return empty view placeholders.",
			"Never return new_card, revise_card, split_card, merge_card, or retire_card.",
			"Do not return a standalone Markdown document; return JSON fields only.",
		].join("\n");
	const requestContext = input.mode === "card_generation"
		? {
			languageContract,
			conceptId: input.conceptId,
			conceptTitle: input.conceptTitle,
			existingCardFronts: input.existingCardFronts,
			formattingContract,
			mode: input.mode,
			sourceContent,
			sourceHash: input.sourceHash,
			sourcePath: input.sourcePath,
		}
		: {
			languageContract,
			existingConcepts: input.existingConcepts,
			formattingContract,
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
			evidence: { items: evidence, minItems: 1, type: "array" },
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
		evidence: { items: evidence, minItems: 1, type: "array" },
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
							whyItMatters: { type: "string" },
							learningMode: { enum: ["reviewable", "exploratory"], type: "string" },
							relatedConceptHints: { items: { type: "string" }, type: "array" },
							suggestedImportance: { enum: ["low", "normal", "high", "critical"], type: "string" },
							tags: { items: { type: "string" }, maxItems: 5, minItems: 1, type: "array" },
							views: {
								items: {
									additionalProperties: false,
									properties: { body: { type: "string" }, title: { type: "string" } },
									required: ["body", "title"],
									type: "object",
								},
								type: "array",
							},
						}, ["conceptTitle", "coreMeaning", "whyItMatters", "learningMode", "relatedConceptHints", "suggestedImportance", "tags", "views"]),
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
							proposedWhyItMatters: { type: "string" },
							reason: { type: "string" },
							targetConceptId: { type: "string" },
							targetConceptTitle: { type: "string" },
						}, ["proposedCoreMeaning", "proposedWhyItMatters", "reason", "targetConceptId", "targetConceptTitle"]),
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
