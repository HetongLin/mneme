import type { MnemeSettings } from "../models/settings";
import { getAiProviderConnection } from "../models/aiProviderCatalog";
import type { AiJsonHttpRequest } from "./aiProvider";

export interface AiJsonRequestInput {
	systemPrompt: string;
	userContent: string;
	schema: Record<string, unknown>;
	schemaName: string;
	maxOutputTokens?: number;
}

export function buildAiJsonRequest(settings: MnemeSettings, input: AiJsonRequestInput): AiJsonHttpRequest {
	const config = getAiProviderConnection(settings);
	assertConnection(config);
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	const maxTokens = input.maxOutputTokens ?? config.maxOutputTokens;
	const baseUrl = config.baseUrl.trim().replace(/\/+$/u, "");
	const systemPrompt = `${input.systemPrompt}\nReturn only one JSON object. Do not include Markdown fences or commentary.`;
	let url: string;
	let body: Record<string, unknown>;

	switch (config.protocol) {
		case "anthropic_messages":
			headers["x-api-key"] = config.apiKey;
			headers["anthropic-version"] = "2023-06-01";
			url = `${baseUrl}/messages`;
			body = {
				model: config.model,
				max_tokens: maxTokens,
				system: systemPrompt,
				messages: [{ role: "user", content: input.userContent }],
				output_config: { format: { type: "json_schema", schema: toPortableJsonSchema(input.schema, true) } },
			};
			break;
		case "gemini_generate_content":
			headers["x-goog-api-key"] = config.apiKey;
			url = `${baseUrl}/models/${encodeURIComponent(config.model.replace(/^models\//u, ""))}:generateContent`;
			body = {
				systemInstruction: { parts: [{ text: systemPrompt }] },
				contents: [{ role: "user", parts: [{ text: input.userContent }] }],
				generationConfig: {
					maxOutputTokens: maxTokens,
					responseFormat: { text: { mimeType: "application/json", schema: toPortableJsonSchema(input.schema, false) } },
				},
			};
			break;
		case "responses":
			if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
			url = `${baseUrl}/responses`;
			body = {
				model: config.model,
				max_output_tokens: maxTokens,
				input: [{ role: "system", content: systemPrompt }, { role: "user", content: input.userContent }],
				text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
			};
			break;
		case "chat_completions":
			if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
			url = `${baseUrl}/chat/completions`;
			body = {
				model: config.model,
				max_tokens: maxTokens,
				messages: [{ role: "system", content: `${systemPrompt}\nRequired JSON schema: ${JSON.stringify(input.schema)}` }, { role: "user", content: input.userContent }],
				...(config.jsonMode ? { response_format: { type: "json_object" } } : {}),
				// Qwen's hybrid models need non-thinking mode for bounded, non-streaming JSON output.
				...(config.name === "qwen" ? { enable_thinking: false } : {}),
			};
			break;
	}
	return { body, headers, url, timeoutMs: settings.aiRequestTimeoutMs };
}

export function parseAiJsonResponse(settings: MnemeSettings, raw: unknown): unknown {
	const config = getAiProviderConnection(settings);
	if (!isRecord(raw)) throw new Error(`${config.label} response did not contain a JSON result.`);
	let text: string | undefined;
	switch (config.protocol) {
		case "anthropic_messages":
			if (raw.stop_reason === "max_tokens") throw new Error(`${config.label} output was truncated. Increase maximum output tokens or reduce the input.`);
			if (raw.stop_reason === "refusal") throw new Error(`${config.label} refused this request.`);
			text = joinTextBlocks(raw.content, "text");
			break;
		case "gemini_generate_content": {
			const candidate = Array.isArray(raw.candidates) ? raw.candidates[0] : undefined;
			if (!isRecord(candidate)) throw new Error(`${config.label} returned no candidate. The request may have been blocked by safety filters.`);
			if (candidate.finishReason !== undefined && candidate.finishReason !== "STOP") {
				throw new Error(`${config.label} did not complete a JSON result. Check safety filters and maximum output tokens.`);
			}
			const content = isRecord(candidate.content) ? candidate.content : undefined;
			text = joinTextBlocks(content?.parts, "text", true);
			break;
		}
		case "responses": {
			if (raw.status === "incomplete" || raw.status === "failed") throw new Error(`${config.label} did not complete a JSON result.`);
			const texts: string[] = [];
			for (const output of Array.isArray(raw.output) ? raw.output : []) {
				if (!isRecord(output)) continue;
				const content = Array.isArray(output.content) ? output.content : [];
				for (const block of content) {
					if (isRecord(block) && block.type === "refusal") throw new Error(`${config.label} refused this request.`);
					if (isRecord(block) && block.type === "output_text" && typeof block.text === "string") texts.push(block.text);
				}
			}
			text = texts.join("");
			break;
		}
		case "chat_completions": {
			const choice = Array.isArray(raw.choices) ? raw.choices[0] : undefined;
			if (!isRecord(choice)) break;
			if (choice.finish_reason !== undefined && choice.finish_reason !== "stop") throw new Error(`${config.label} did not complete a JSON result. Check safety filters and maximum output tokens.`);
			const message = isRecord(choice.message) ? choice.message : undefined;
			if (message?.refusal) throw new Error(`${config.label} refused this request.`);
			text = typeof message?.content === "string" ? message.content : joinTextBlocks(message?.content, "text");
			break;
		}
	}
	if (!text?.trim()) throw new Error(`${config.label} response did not contain a JSON result.`);
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${config.label} response contained invalid JSON.`);
	}
}

export function getAiConnectionIssues(config: ReturnType<typeof getAiProviderConnection>, requireApiKey = true): string[] {
	const issues: string[] = [];
	if (requireApiKey && config.name !== "custom" && !config.apiKey.trim()) issues.push(`${config.label} API key is required to use this provider.`);
	if (!config.model.trim()) issues.push(`${config.label} model is required to use this provider.`);
	try {
		const url = new URL(config.baseUrl);
		if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
	} catch {
		issues.push(`${config.label} base URL must be an HTTP(S) URL without credentials, query parameters, or fragments.`);
	}
	return issues;
}

function assertConnection(config: ReturnType<typeof getAiProviderConnection>): void {
	const issues = getAiConnectionIssues(config);
	if (issues.length) throw new Error(issues.join(" "));
}

function joinTextBlocks(blocks: unknown, field: string, skipThoughts = false): string | undefined {
	if (!Array.isArray(blocks)) return undefined;
	return blocks.filter((block) => isRecord(block) && (!skipThoughts || block.thought !== true))
		.map((block) => isRecord(block) && typeof block[field] === "string" ? block[field] : "").join("");
}

// The API receives a portable subset; Mneme still validates the original schema locally.
function toPortableJsonSchema(value: unknown, anthropic: boolean): unknown {
	if (Array.isArray(value)) return value.map((item) => toPortableJsonSchema(item, anthropic));
	if (!isRecord(value)) return value;
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (key === "const") {
			result.enum = [item];
		} else if (anthropic && ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(key)) {
			continue;
		} else {
			result[key] = toPortableJsonSchema(item, anthropic);
		}
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
