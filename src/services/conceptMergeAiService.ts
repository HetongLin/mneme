import type { ConceptSummary } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import type { AiJsonHttpClient, AiJsonHttpRequest } from "./aiProvider";
import { validateAiProviderConfig } from "./aiProvider";
import { shouldOfferEnglishAlias } from "./conceptNaming";

export type ConceptMergeAiClassification =
	| "likely_duplicate"
	| "overlapping_but_distinct"
	| "related"
	| "uncertain";

export interface ConceptMergeAiInspection {
	classification: ConceptMergeAiClassification;
	conceptId: string;
	reason: string;
}

export interface ConceptMergeAiDraft {
	coreMeaning: string;
	englishName?: string;
	title: string;
	whyItMatters: string;
}

export interface ConceptMergeAiServiceOptions {
	httpClient?: AiJsonHttpClient;
	settingsProvider(): MnemeSettings;
}

export interface InspectConceptMergeCandidatesInput {
	candidates: ConceptSummary[];
	selected: ConceptSummary;
}

export interface DraftConceptMergeInput {
	first: ConceptSummary;
	firstMarkdown: string;
	second: ConceptSummary;
	secondMarkdown: string;
}

export class ConceptMergeAiService {
	constructor(private readonly options: ConceptMergeAiServiceOptions) {
	}

	async inspectCandidates(input: InspectConceptMergeCandidatesInput): Promise<ConceptMergeAiInspection[]> {
		const candidates = input.candidates
			.filter((candidate) => candidate.conceptId !== input.selected.conceptId)
			.slice(0, 8);
		if (candidates.length === 0) return [];
		const settings = this.validateSettings();
		if (settings.aiProvider === "mock") {
			return candidates.map((candidate) => ({
				classification: candidate.title.trim().toLocaleLowerCase() === input.selected.title.trim().toLocaleLowerCase()
					? "likely_duplicate"
					: "uncertain",
				conceptId: candidate.conceptId,
				reason: "Mock inspection uses exact normalized title matching.",
			}));
		}

		const request = buildConceptMergeAiRequest(settings, "inspection", {
			candidates: candidates.map(toInspectionConcept),
			selected: toInspectionConcept(input.selected),
		});
		const raw = await this.request(settings, request);
		const parsed = parseInspectionResult(raw);
		const allowedIds = new Set(candidates.map((candidate) => candidate.conceptId));
		const seen = new Set<string>();
		for (const result of parsed) {
			if (!allowedIds.has(result.conceptId)) {
				throw new Error(`AI Merge inspection returned an unknown Concept ID: ${result.conceptId}`);
			}
			if (seen.has(result.conceptId)) {
				throw new Error(`AI Merge inspection returned Concept ${result.conceptId} more than once.`);
			}
			seen.add(result.conceptId);
		}
		if (seen.size !== candidates.length) {
			throw new Error("AI Merge inspection did not classify every shortlisted Concept.");
		}
		return parsed;
	}

	async draftMerge(input: DraftConceptMergeInput): Promise<ConceptMergeAiDraft> {
		const settings = this.validateSettings();
		const contentLength = input.firstMarkdown.length + input.secondMarkdown.length;
		if (contentLength > settings.aiMaxInputChars) {
			throw new Error("The selected Concepts exceed the AI input limit. Use Manual Draft or increase AI max input characters.");
		}
		if (settings.aiProvider === "mock") {
			const title = input.first.primaryTitle ?? input.first.title;
			return {
				coreMeaning: [input.first.coreMeaning, input.second.coreMeaning].filter(Boolean).join("\n\n"),
				...(settings.suggestEnglishAliases && shouldOfferEnglishAlias(title)
					? { englishName: input.first.englishName ?? input.second.englishName }
					: {}),
				title,
				whyItMatters: [input.first.whyItMatters, input.second.whyItMatters].filter(Boolean).join("\n\n"),
			};
		}

		const request = buildConceptMergeAiRequest(settings, "draft", {
			first: {
				conceptId: input.first.conceptId,
				markdown: input.firstMarkdown,
				path: input.first.path,
			},
			second: {
				conceptId: input.second.conceptId,
				markdown: input.secondMarkdown,
				path: input.second.path,
			},
		});
		return parseDraftResult(await this.request(settings, request), settings.suggestEnglishAliases);
	}

	private validateSettings(): MnemeSettings {
		const settings = this.options.settingsProvider();
		if (!settings.aiCaptureEnabled) {
			throw new Error("Enable AI capture in Mneme Settings to use AI Merge assistance. Manual Merge remains available.");
		}
		const validation = validateAiProviderConfig(settings);
		if (!validation.valid) throw new Error(validation.errors.join(" "));
		return settings;
	}

	private async request(settings: MnemeSettings, request: AiJsonHttpRequest): Promise<unknown> {
		if (!this.options.httpClient) throw new Error("AI network transport is not configured.");
		const raw = await this.options.httpClient.postJson(request);
		return settings.aiProvider === "openai"
			? parseOpenAiResponse(raw)
			: parseChatCompletionResponse(raw);
	}
}

export function buildConceptMergeAiRequest(
	settings: MnemeSettings,
	mode: "draft" | "inspection",
	input: unknown,
): AiJsonHttpRequest {
	const jsonOutputInstruction = mode === "inspection"
		? "Return one JSON object with this shape: {\"results\":[{\"classification\":\"likely_duplicate\",\"conceptId\":\"<candidate id>\",\"reason\":\"<concise reason>\"}]}."
		: `Return one JSON object with this shape: {"title":"<merged title>","coreMeaning":"<merged core meaning>","whyItMatters":"<merged value>"${settings.suggestEnglishAliases ? ',"englishName":"<optional English alias or empty string>"' : ""}}.`;
	const systemPrompt = mode === "inspection"
		? [
			"You are assisting a user-controlled Concept Merge workflow.",
			"Classify only the supplied shortlist against selected as likely_duplicate, overlapping_but_distinct, related, or uncertain.",
			"Do not select a merge, rewrite knowledge, inspect Cards, infer FSRS actions, or request additional vault context.",
			"Return every supplied candidate conceptId exactly once with one concise reason.",
			jsonOutputInstruction,
		].join(" ")
		: [
			"Draft learning prose for two Concepts the user explicitly selected for Merge.",
			`Return only title, coreMeaning, whyItMatters${settings.suggestEnglishAliases ? ", and englishName" : ""}.`,
			"Preserve distinct supported knowledge from both Markdown inputs; do not invent claims.",
			"Use the dominant language of the selected Concepts for title and learning prose.",
			settings.suggestEnglishAliases
				? "For a non-English title, englishName is an optional canonical English display alias. Return an empty englishName when title is already English."
				: "English aliases are disabled. Do not return englishName.",
			"Do not choose the surviving identity, change IDs or paths, decide Cards, Related links, Source Notes, FSRS state, tags, importance, or learning mode.",
			jsonOutputInstruction,
		].join(" ");
	const messages = [
		{ content: systemPrompt, role: "system" },
		{ content: JSON.stringify(input), role: "user" },
	];

	if (settings.aiProvider === "openai") {
		return {
			body: {
				input: messages,
				model: settings.openaiModel,
				text: { format: createOpenAiFormat(mode, settings.suggestEnglishAliases) },
			},
			headers: {
				Authorization: `Bearer ${settings.openaiApiKey}`,
				"Content-Type": "application/json",
			},
			timeoutMs: settings.aiRequestTimeoutMs,
			url: `${settings.openaiBaseUrl.replace(/\/+$/g, "")}/responses`,
		};
	}

	return {
		body: {
			max_tokens: 4000,
			messages,
			model: settings.deepseekModel,
			response_format: { type: "json_object" },
			thinking: { type: "disabled" },
		},
		headers: {
			Authorization: `Bearer ${settings.deepseekApiKey}`,
			"Content-Type": "application/json",
		},
		timeoutMs: settings.aiRequestTimeoutMs,
		url: `${settings.deepseekBaseUrl.replace(/\/+$/g, "")}/chat/completions`,
	};
}

function toInspectionConcept(concept: ConceptSummary): Record<string, unknown> {
	return {
		conceptId: concept.conceptId,
		coreMeaning: concept.coreMeaning ?? "",
		englishName: concept.englishName ?? "",
		title: concept.title,
		whyItMatters: concept.whyItMatters ?? "",
	};
}

function createOpenAiFormat(
	mode: "draft" | "inspection",
	suggestEnglishAliases: boolean,
): Record<string, unknown> {
	const schema = mode === "inspection"
		? {
			additionalProperties: false,
			properties: {
				results: {
					items: {
						additionalProperties: false,
						properties: {
							classification: { enum: ["likely_duplicate", "overlapping_but_distinct", "related", "uncertain"], type: "string" },
							conceptId: { type: "string" },
							reason: { type: "string" },
						},
						required: ["classification", "conceptId", "reason"],
						type: "object",
					},
					type: "array",
				},
			},
			required: ["results"],
			type: "object",
		}
		: {
			additionalProperties: false,
			properties: {
				coreMeaning: { type: "string" },
				...(suggestEnglishAliases ? { englishName: { type: "string" } } : {}),
				title: { type: "string" },
				whyItMatters: { type: "string" },
			},
			required: [
				"title",
				...(suggestEnglishAliases ? ["englishName"] : []),
				"coreMeaning",
				"whyItMatters",
			],
			type: "object",
		};
	return {
		name: mode === "inspection" ? "mneme_merge_inspection" : "mneme_merge_draft",
		schema,
		strict: true,
		type: "json_schema",
	};
}

function parseOpenAiResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.output)) throw new Error("OpenAI Merge response did not contain JSON.");
	for (const output of raw.output) {
		if (!isRecord(output) || !Array.isArray(output.content)) continue;
		for (const content of output.content) {
			if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
				return parseJson(content.text, "OpenAI");
			}
		}
	}
	throw new Error("OpenAI Merge response did not contain JSON.");
}

function parseChatCompletionResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.choices)) throw new Error("AI Merge response did not contain JSON.");
	const choice = raw.choices[0];
	const message = isRecord(choice) ? choice.message : undefined;
	const content = isRecord(message) ? message.content : undefined;
	if (typeof content !== "string") throw new Error("AI Merge response did not contain JSON.");
	return parseJson(content, "AI");
}

function parseJson(value: string, provider: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		throw new Error(`${provider} Merge response contained invalid JSON.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInspectionResult(value: unknown): ConceptMergeAiInspection[] {
	if (!isRecord(value) || !Array.isArray(value.results)) {
		throw new Error("AI Merge inspection response must contain a results array.");
	}
	return value.results.map((item, index) => {
		if (!isRecord(item)
			|| !isClassification(item.classification)
			|| typeof item.conceptId !== "string"
			|| item.conceptId.trim().length === 0
			|| typeof item.reason !== "string"
			|| item.reason.trim().length === 0) {
			throw new Error(`AI Merge inspection result ${index + 1} is invalid.`);
		}
		return {
			classification: item.classification,
			conceptId: item.conceptId.trim(),
			reason: item.reason.trim(),
		};
	});
}

function parseDraftResult(value: unknown, suggestEnglishAliases: boolean): ConceptMergeAiDraft {
	if (!isRecord(value)) throw new Error("AI Merge draft response must be an object.");
	const title = requireNonEmptyString(value.title, "title");
	const coreMeaning = requireNonEmptyString(value.coreMeaning, "coreMeaning");
	if (typeof value.whyItMatters !== "string") {
		throw new Error("AI Merge draft whyItMatters must be a string.");
	}
	return {
		coreMeaning,
		...(suggestEnglishAliases
			&& shouldOfferEnglishAlias(title)
			&& typeof value.englishName === "string"
			&& value.englishName.trim()
			? { englishName: value.englishName.trim() }
			: {}),
		title,
		whyItMatters: value.whyItMatters.trim(),
	};
}

function requireNonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`AI Merge draft ${field} must be a non-empty string.`);
	}
	return value.trim();
}

function isClassification(value: unknown): value is ConceptMergeAiClassification {
	return value === "likely_duplicate"
		|| value === "overlapping_but_distinct"
		|| value === "related"
		|| value === "uncertain";
}
