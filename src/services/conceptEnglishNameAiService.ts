import type { MnemeSettings } from "../models/settings";
import type { AiJsonHttpClient, AiJsonHttpRequest } from "./aiProvider";
import { validateAiProviderConfig } from "./aiProvider";
import { isCanonicalEnglishName } from "./conceptNaming";

export interface ConceptEnglishNameSuggestion {
	englishName: string;
}

export interface ConceptEnglishNameAiServiceOptions {
	httpClient?: AiJsonHttpClient;
	settingsProvider(): MnemeSettings;
}

export class ConceptEnglishNameAiService {
	constructor(private readonly options: ConceptEnglishNameAiServiceOptions) {
	}

	isAvailable(): boolean {
		const settings = this.options.settingsProvider();
		return settings.aiCaptureEnabled && validateAiProviderConfig(settings).valid;
	}

	async suggest(title: string, coreMeaning: string): Promise<ConceptEnglishNameSuggestion> {
		const normalizedTitle = title.trim();
		const normalizedCoreMeaning = coreMeaning.trim();
		if (!normalizedTitle) throw new Error("Concept Title is required before generating an English Name.");
		if (!normalizedCoreMeaning) throw new Error("Core Meaning is required before generating an English Name.");

		const settings = this.validateSettings();
		if (settings.aiProvider === "mock") {
			if (containsOnlyAscii(normalizedTitle)) {
				return { englishName: normalizedTitle };
			}
			throw new Error("The Mock provider cannot translate a non-English Concept Title.");
		}

		if (!this.options.httpClient) throw new Error("AI network transport is not configured.");
		const raw = await this.options.httpClient.postJson(buildConceptEnglishNameRequest(
			settings,
			normalizedTitle,
			normalizedCoreMeaning,
		));
		const parsed = settings.aiProvider === "openai"
			? parseOpenAiResponse(raw)
			: parseChatCompletionResponse(raw);
		return parseConceptEnglishNameSuggestion(parsed);
	}

	private validateSettings(): MnemeSettings {
		const settings = this.options.settingsProvider();
		if (!settings.aiCaptureEnabled) {
			throw new Error("Enable AI capture in Mneme Settings to generate an English Name.");
		}
		const validation = validateAiProviderConfig(settings);
		if (!validation.valid) throw new Error(validation.errors.join(" "));
		return settings;
	}
}

export function buildConceptEnglishNameRequest(
	settings: MnemeSettings,
	title: string,
	coreMeaning: string,
): AiJsonHttpRequest {
	const namingGuidance = [
		"You assist with naming one user-authored learning Concept.",
		"Translate the supplied non-English title into the shortest unambiguous canonical English term.",
		"Use coreMeaning only to disambiguate the intended knowledge and domain.",
		"Preserve the Concept's scope and qualifiers. Do not broaden, narrow, explain, or rewrite the Concept.",
		"Use the term's standard scholarly capitalization. If no established capitalization exists, use Title Case.",
		"Preserve conventional casing for acronyms, symbols, and established terms such as k-means, p-value, t-SNE, L1 Regularization, and MAP Estimation.",
	];
	const inputMessage = { content: JSON.stringify({ coreMeaning, title }), role: "user" };

	if (settings.aiProvider === "openai") {
		const messages = [
			{
				content: [
					...namingGuidance,
					"Return exactly one json object with the shape {\"englishName\":\"<canonical English term>\"}.",
					"Do not return Markdown, commentary, or any keys other than englishName.",
				].join(" "),
				role: "system",
			},
			inputMessage,
		];
		return {
			body: {
				input: messages,
				model: settings.openaiModel,
				text: {
					format: {
						name: "mneme_concept_english_name",
						schema: {
							additionalProperties: false,
							properties: {
								englishName: { type: "string" },
							},
							required: ["englishName"],
							type: "object",
						},
						strict: true,
						type: "json_schema",
					},
				},
			},
			headers: {
				Authorization: `Bearer ${settings.openaiApiKey}`,
				"Content-Type": "application/json",
			},
			timeoutMs: settings.aiRequestTimeoutMs,
			url: `${settings.openaiBaseUrl.replace(/\/+$/g, "")}/responses`,
		};
	}

	const messages = [
		{
			content: [
				...namingGuidance,
				"Return only the canonical English term as plain text on one line.",
				"Do not return JSON, Markdown, a label, quotation marks, or commentary.",
			].join(" "),
			role: "system",
		},
		inputMessage,
	];

	return {
		body: {
			max_tokens: 60,
			messages,
			model: settings.deepseekModel,
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

export function parseConceptEnglishNameSuggestion(
	value: unknown,
): ConceptEnglishNameSuggestion {
	if (!isRecord(value)
		|| typeof value.englishName !== "string"
		|| !value.englishName.trim()) {
		throw new Error("AI English Name response must contain englishName.");
	}

	const englishName = value.englishName.trim();
	if (!isCanonicalEnglishName(englishName)) {
		throw new Error("AI title translation must be a canonical English term in Latin-script text.");
	}
	return {
		englishName,
	};
}

function parseOpenAiResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.output)) {
		throw new Error("OpenAI title-language response did not contain JSON.");
	}
	for (const output of raw.output) {
		if (!isRecord(output) || !Array.isArray(output.content)) continue;
		for (const content of output.content) {
			if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
				return parseJson(content.text, "OpenAI");
			}
		}
	}
	throw new Error("OpenAI title-language response did not contain JSON.");
}

function parseChatCompletionResponse(raw: unknown): unknown {
	if (!isRecord(raw) || !Array.isArray(raw.choices)) {
		throw new Error("AI title-language response did not contain an English Name.");
	}
	const choice = raw.choices[0];
	const message = isRecord(choice) ? choice.message : undefined;
	const content = isRecord(message) ? message.content : undefined;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("AI title-language response did not contain an English Name.");
	}

	try {
		const legacyJson = parseJson(content, "AI");
		return typeof legacyJson === "string"
			? { englishName: legacyJson }
			: legacyJson;
	} catch {
		return { englishName: parsePlainEnglishName(content) };
	}
}

function parsePlainEnglishName(value: string): string {
	let candidate = value.trim().replace(/^\uFEFF/u, "");
	const fenced = candidate.match(/^```(?:text|plaintext)?\s*([\s\S]*?)\s*```$/iu)?.[1]?.trim();
	if (fenced) candidate = fenced;

	const jsonLikeField = candidate.match(
		/(?:["']?englishName["']?|English\s+Name)\s*[:：]\s*["'“”]?([^"'“”\r\n,}]+)["'“”]?/iu,
	)?.[1]?.trim();
	if (jsonLikeField) {
		candidate = jsonLikeField;
	} else {
		const sentenceValue = candidate.match(
			/^(?:The\s+)?(?:canonical\s+)?English\s+name\s+(?:is|would\s+be)\s+["'“”]?(.+?)["'“”]?[.!]?$/iu,
		)?.[1]?.trim();
		if (sentenceValue) candidate = sentenceValue;
	}

	candidate = candidate
		.replace(/^(?:\*\*|__|`|["'“”])+|(?:\*\*|__|`|["'“”])+$/gu, "")
		.replace(/\.$/u, "")
		.trim();

	if (!candidate
		|| candidate.length > 160
		|| /[\r\n{}]/u.test(candidate)
		|| candidate.split(/\s+/u).length > 20
		|| !isCanonicalEnglishName(candidate)) {
		throw new Error("AI title-language response did not contain one canonical English term.");
	}
	return candidate;
}

function parseJson(value: string, provider: string): unknown {
	const normalized = value.trim().replace(/^\uFEFF/u, "");
	const candidates = new Set<string>([normalized]);
	const fenced = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1]?.trim();
	if (fenced) candidates.add(fenced);

	const objectStart = normalized.indexOf("{");
	const objectEnd = normalized.lastIndexOf("}");
	if (objectStart >= 0 && objectEnd > objectStart) {
		candidates.add(normalized.slice(objectStart, objectEnd + 1));
	}

	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate);
		} catch {
			// Try the next bounded representation. We deliberately do not
			// interpret arbitrary prose as an English Name.
		}
	}

	throw new Error(`${provider} title-language response contained invalid JSON.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsOnlyAscii(value: string): boolean {
	return /^[\x00-\x7f]+$/u.test(value);
}
