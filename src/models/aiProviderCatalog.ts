import type { MnemeSettings } from "./settings";

export const ADDITIONAL_AI_PROVIDER_NAMES = ["anthropic", "gemini", "qwen", "zhipu", "moonshot", "siliconflow", "custom"] as const;
export type AdditionalAiProviderName = typeof ADDITIONAL_AI_PROVIDER_NAMES[number];
export type AiProviderName = "mock" | "openai" | "deepseek" | AdditionalAiProviderName;
export type AiApiProtocol = "responses" | "chat_completions" | "anthropic_messages" | "gemini_generate_content";

export interface AiProviderProfile {
	apiKey: string;
	baseUrl: string;
	model: string;
	protocol: AiApiProtocol;
	jsonMode: boolean;
	maxOutputTokens: number;
}

export interface AiProviderDefinition {
	name: AiProviderName;
	label: string;
	baseUrl: string;
	protocol: AiApiProtocol;
}

export const AI_PROVIDER_DEFINITIONS: readonly AiProviderDefinition[] = [
	{ name: "mock", label: "Mock (offline demo)", baseUrl: "", protocol: "chat_completions" },
	{ name: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "responses" },
	{ name: "anthropic", label: "Anthropic (Claude)", baseUrl: "https://api.anthropic.com/v1", protocol: "anthropic_messages" },
	{ name: "gemini", label: "Google (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", protocol: "gemini_generate_content" },
	{ name: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", protocol: "chat_completions" },
	{ name: "qwen", label: "Alibaba Cloud (Qwen)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "chat_completions" },
	{ name: "zhipu", label: "Zhipu (GLM)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", protocol: "chat_completions" },
	{ name: "moonshot", label: "Moonshot (Kimi)", baseUrl: "https://api.moonshot.cn/v1", protocol: "chat_completions" },
	{ name: "siliconflow", label: "SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", protocol: "chat_completions" },
	{ name: "custom", label: "Custom (OpenAI-compatible)", baseUrl: "", protocol: "chat_completions" },
];

export function isAiProviderName(value: unknown): value is AiProviderName {
	return AI_PROVIDER_DEFINITIONS.some((definition) => definition.name === value);
}

export function isAdditionalAiProviderName(value: unknown): value is AdditionalAiProviderName {
	return ADDITIONAL_AI_PROVIDER_NAMES.some((name) => name === value);
}

export function getAiProviderDefinition(name: AiProviderName): AiProviderDefinition {
	const definition = AI_PROVIDER_DEFINITIONS.find((entry) => entry.name === name);
	if (!definition) throw new Error("Unknown AI provider.");
	return definition;
}

export function createDefaultAiProviderProfiles(): Record<AdditionalAiProviderName, AiProviderProfile> {
	const profiles = {} as Record<AdditionalAiProviderName, AiProviderProfile>;
	for (const name of ADDITIONAL_AI_PROVIDER_NAMES) {
		const definition = getAiProviderDefinition(name);
		profiles[name] = { apiKey: "", baseUrl: definition.baseUrl, model: "", protocol: definition.protocol, jsonMode: true, maxOutputTokens: 8192 };
	}
	return profiles;
}

export function normalizeAiProviderProfiles(value: unknown): Record<AdditionalAiProviderName, AiProviderProfile> {
	const result = createDefaultAiProviderProfiles();
	if (!isRecord(value)) return result;
	for (const name of ADDITIONAL_AI_PROVIDER_NAMES) {
		const profile = value[name];
		if (!isRecord(profile)) continue;
		const defaults = result[name];
		result[name] = {
			apiKey: typeof profile.apiKey === "string" ? profile.apiKey.trim() : "",
			baseUrl: typeof profile.baseUrl === "string" ? profile.baseUrl.trim().replace(/\/+$/u, "") || defaults.baseUrl : defaults.baseUrl,
			model: typeof profile.model === "string" ? profile.model.trim() : "",
			protocol: name === "custom" && (profile.protocol === "responses" || profile.protocol === "chat_completions") ? profile.protocol : defaults.protocol,
			jsonMode: typeof profile.jsonMode === "boolean" ? profile.jsonMode : true,
			maxOutputTokens: typeof profile.maxOutputTokens === "number" && Number.isFinite(profile.maxOutputTokens)
				? Math.min(65536, Math.max(1, Math.round(profile.maxOutputTokens))) : defaults.maxOutputTokens,
		};
	}
	return result;
}

export function getAiProviderConnection(settings: MnemeSettings): AiProviderProfile & { name: AiProviderName; label: string } {
	const definition = getAiProviderDefinition(settings.aiProvider);
	if (settings.aiProvider === "openai" || settings.aiProvider === "deepseek") {
		const openai = settings.aiProvider === "openai";
		return {
			apiKey: openai ? settings.openaiApiKey : settings.deepseekApiKey,
			baseUrl: openai ? settings.openaiBaseUrl : settings.deepseekBaseUrl,
			model: openai ? settings.openaiModel : settings.deepseekModel,
			protocol: definition.protocol, jsonMode: true, maxOutputTokens: 8192,
			name: definition.name, label: definition.label,
		};
	}
	const profile = isAdditionalAiProviderName(settings.aiProvider)
		? settings.aiProviderProfiles[settings.aiProvider]
		: { apiKey: "", baseUrl: "", model: "", protocol: definition.protocol, jsonMode: true, maxOutputTokens: 8192 };
	return { ...profile, name: definition.name, label: definition.label };
}

// Settings may change while a request is in flight. Its response must use the
// same provider, protocol, and policy that produced the request.
export function snapshotAiSettings(settings: MnemeSettings): MnemeSettings {
	const profiles = createDefaultAiProviderProfiles();
	for (const name of ADDITIONAL_AI_PROVIDER_NAMES) {
		profiles[name] = { ...settings.aiProviderProfiles[name] };
	}
	return { ...settings, allowedAiCardTypes: [...settings.allowedAiCardTypes], aiProviderProfiles: profiles };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
