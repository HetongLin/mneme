import { CARD_DRAFT_TYPES, type CardDraftType } from "./knowledgeProposal";

export interface MnemeSettings {
	allowedAiCardTypes: CardDraftType[];
	aiCaptureEnabled: boolean;
	aiMaxInputChars: number;
	aiProvider: AiProviderName;
	aiRequestTimeoutMs: number;
	cardsFolder: string;
	conceptsFolder: string;
	deepseekApiKey: string;
	deepseekBaseUrl: string;
	deepseekModel: string;
	enableDeveloperTools: boolean;
	fsrsEnableFuzz: boolean;
	fsrsEnabled: boolean;
	fsrsMaximumInterval: number;
	fsrsRequestRetention: number;
	openaiApiKey: string;
	openaiBaseUrl: string;
	openaiModel: string;
	showAdvancedDiagnostics: boolean;
	suggestEnglishAliases: boolean;
}

export type AiProviderName = "mock" | "openai" | "deepseek";

const LEGACY_DEFAULT_AI_REQUEST_TIMEOUT_MS = 30000;

export const DEFAULT_SETTINGS: MnemeSettings = {
	allowedAiCardTypes: [...CARD_DRAFT_TYPES],
	aiCaptureEnabled: false,
	aiMaxInputChars: 20000,
	aiProvider: "mock",
	aiRequestTimeoutMs: 120000,
	cardsFolder: "Mneme/Cards",
	conceptsFolder: "Mneme/Concepts",
	deepseekApiKey: "",
	deepseekBaseUrl: "https://api.deepseek.com",
	deepseekModel: "deepseek-v4-flash",
	enableDeveloperTools: false,
	fsrsEnableFuzz: false,
	fsrsEnabled: true,
	fsrsMaximumInterval: 36500,
	fsrsRequestRetention: 0.9,
	openaiApiKey: "",
	openaiBaseUrl: "https://api.openai.com/v1",
	openaiModel: "gpt-4.1-mini",
	showAdvancedDiagnostics: false,
	suggestEnglishAliases: false,
};

export function normalizeSettings(value: unknown): MnemeSettings {
	if (!isObject(value)) {
		return { ...DEFAULT_SETTINGS };
	}

	return {
		allowedAiCardTypes: normalizeAllowedAiCardTypes(value.allowedAiCardTypes),
		aiCaptureEnabled: typeof value.aiCaptureEnabled === "boolean"
			? value.aiCaptureEnabled
			: DEFAULT_SETTINGS.aiCaptureEnabled,
		aiMaxInputChars: normalizePositiveInteger(value.aiMaxInputChars, DEFAULT_SETTINGS.aiMaxInputChars),
		aiProvider: normalizeAiProvider(value.aiProvider),
		aiRequestTimeoutMs: normalizeAiRequestTimeoutMs(value.aiRequestTimeoutMs),
		cardsFolder: normalizeFolder(value.cardsFolder, DEFAULT_SETTINGS.cardsFolder),
		conceptsFolder: normalizeFolder(value.conceptsFolder, DEFAULT_SETTINGS.conceptsFolder),
		deepseekApiKey: normalizeString(value.deepseekApiKey, DEFAULT_SETTINGS.deepseekApiKey),
		deepseekBaseUrl: normalizeUrlString(value.deepseekBaseUrl, DEFAULT_SETTINGS.deepseekBaseUrl),
		deepseekModel: normalizeRequiredString(value.deepseekModel, DEFAULT_SETTINGS.deepseekModel),
		enableDeveloperTools: typeof value.enableDeveloperTools === "boolean"
			? value.enableDeveloperTools
			: DEFAULT_SETTINGS.enableDeveloperTools,
		fsrsEnableFuzz: typeof value.fsrsEnableFuzz === "boolean"
			? value.fsrsEnableFuzz
			: DEFAULT_SETTINGS.fsrsEnableFuzz,
		fsrsEnabled: typeof value.fsrsEnabled === "boolean"
			? value.fsrsEnabled
			: DEFAULT_SETTINGS.fsrsEnabled,
		fsrsMaximumInterval: normalizeMaximumInterval(value.fsrsMaximumInterval),
		fsrsRequestRetention: normalizeRetention(value.fsrsRequestRetention),
		openaiApiKey: normalizeString(value.openaiApiKey, DEFAULT_SETTINGS.openaiApiKey),
		openaiBaseUrl: normalizeUrlString(value.openaiBaseUrl, DEFAULT_SETTINGS.openaiBaseUrl),
		openaiModel: normalizeRequiredString(value.openaiModel, DEFAULT_SETTINGS.openaiModel),
		showAdvancedDiagnostics: typeof value.showAdvancedDiagnostics === "boolean"
			? value.showAdvancedDiagnostics
			: DEFAULT_SETTINGS.showAdvancedDiagnostics,
		suggestEnglishAliases: typeof value.suggestEnglishAliases === "boolean"
			? value.suggestEnglishAliases
			: DEFAULT_SETTINGS.suggestEnglishAliases,
	};
}

export function getSettingsFromPluginData(data: unknown): MnemeSettings {
	if (!isObject(data)) {
		return { ...DEFAULT_SETTINGS };
	}

	return normalizeSettings(isObject(data.settings) ? data.settings : data);
}

export function mergeSettingsIntoPluginData(data: unknown, settings: MnemeSettings): Record<string, unknown> {
	return {
		...(isObject(data) ? data : {}),
		settings: normalizeSettings(settings),
	};
}

export function normalizeRetention(value: unknown): number {
	return clampNumber(value, 0.7, 0.98, DEFAULT_SETTINGS.fsrsRequestRetention);
}

export function getRetentionWorkloadWarning(retention: number): string {
	if (retention >= 0.95) {
		return "Very high retention can create a much heavier review workload.";
	}

	if (retention >= 0.92) {
		return "High retention usually means shorter intervals and more frequent reviews.";
	}

	if (retention <= 0.8) {
		return "Lower retention reduces workload but makes forgotten Cards more likely.";
	}

	return "Balanced retention keeps review workload moderate.";
}

export function normalizeMaximumInterval(value: unknown): number {
	return Math.max(1, Math.round(clampNumber(value, 1, Number.MAX_SAFE_INTEGER, DEFAULT_SETTINGS.fsrsMaximumInterval)));
}

export function normalizePositiveInteger(value: unknown, fallback: number): number {
	return Math.max(1, Math.round(clampNumber(value, 1, Number.MAX_SAFE_INTEGER, fallback)));
}

function normalizeAiRequestTimeoutMs(value: unknown): number {
	const normalized = normalizePositiveInteger(value, DEFAULT_SETTINGS.aiRequestTimeoutMs);

	return normalized === LEGACY_DEFAULT_AI_REQUEST_TIMEOUT_MS
		? DEFAULT_SETTINGS.aiRequestTimeoutMs
		: normalized;
}

function normalizeAllowedAiCardTypes(value: unknown): CardDraftType[] {
	if (!Array.isArray(value)) {
		return [...DEFAULT_SETTINGS.allowedAiCardTypes];
	}

	const allowed = new Set<CardDraftType>();
	for (const item of value) {
		if (isCardDraftType(item)) {
			allowed.add(item);
		}
	}

	return allowed.size > 0 ? [...CARD_DRAFT_TYPES].filter((type) => allowed.has(type)) : [...DEFAULT_SETTINGS.allowedAiCardTypes];
}

function isCardDraftType(value: unknown): value is CardDraftType {
	return typeof value === "string" && CARD_DRAFT_TYPES.some((type) => type === value);
}

export function normalizeFolder(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const normalized = value
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");

	return normalized || fallback;
}

function normalizeAiProvider(value: unknown): AiProviderName {
	return value === "deepseek" || value === "openai" || value === "mock"
		? value
		: DEFAULT_SETTINGS.aiProvider;
}

function normalizeString(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}

	return value.trim();
}

function normalizeRequiredString(value: unknown, fallback: string): string {
	const normalized = normalizeString(value, fallback);

	return normalized || fallback;
}

function normalizeUrlString(value: unknown, fallback: string): string {
	const normalized = normalizeString(value, fallback).replace(/\/+$/g, "");

	return normalized || fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, value));
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
