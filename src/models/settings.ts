export interface MnemeSettings {
	aiCaptureEnabled: boolean;
	aiMaxInputChars: number;
	aiProvider: AiProviderName;
	aiRequestTimeoutMs: number;
	cardsFolder: string;
	conceptsFolder: string;
	enableDeveloperTools: boolean;
	fsrsEnableFuzz: boolean;
	fsrsMaximumInterval: number;
	fsrsRequestRetention: number;
	openaiApiKey: string;
	openaiBaseUrl: string;
	openaiModel: string;
}

export type AiProviderName = "mock" | "openai";

export const DEFAULT_SETTINGS: MnemeSettings = {
	aiCaptureEnabled: false,
	aiMaxInputChars: 20000,
	aiProvider: "mock",
	aiRequestTimeoutMs: 30000,
	cardsFolder: "Mneme/Cards",
	conceptsFolder: "Mneme/Concepts",
	enableDeveloperTools: false,
	fsrsEnableFuzz: false,
	fsrsMaximumInterval: 36500,
	fsrsRequestRetention: 0.9,
	openaiApiKey: "",
	openaiBaseUrl: "https://api.openai.com/v1",
	openaiModel: "gpt-4.1-mini",
};

export function normalizeSettings(value: unknown): MnemeSettings {
	if (!isObject(value)) {
		return { ...DEFAULT_SETTINGS };
	}

	return {
		aiCaptureEnabled: typeof value.aiCaptureEnabled === "boolean"
			? value.aiCaptureEnabled
			: DEFAULT_SETTINGS.aiCaptureEnabled,
		aiMaxInputChars: normalizePositiveInteger(value.aiMaxInputChars, DEFAULT_SETTINGS.aiMaxInputChars),
		aiProvider: normalizeAiProvider(value.aiProvider),
		aiRequestTimeoutMs: normalizePositiveInteger(value.aiRequestTimeoutMs, DEFAULT_SETTINGS.aiRequestTimeoutMs),
		cardsFolder: normalizeFolder(value.cardsFolder, DEFAULT_SETTINGS.cardsFolder),
		conceptsFolder: normalizeFolder(value.conceptsFolder, DEFAULT_SETTINGS.conceptsFolder),
		enableDeveloperTools: typeof value.enableDeveloperTools === "boolean"
			? value.enableDeveloperTools
			: DEFAULT_SETTINGS.enableDeveloperTools,
		fsrsEnableFuzz: typeof value.fsrsEnableFuzz === "boolean"
			? value.fsrsEnableFuzz
			: DEFAULT_SETTINGS.fsrsEnableFuzz,
		fsrsMaximumInterval: normalizeMaximumInterval(value.fsrsMaximumInterval),
		fsrsRequestRetention: normalizeRetention(value.fsrsRequestRetention),
		openaiApiKey: normalizeString(value.openaiApiKey, DEFAULT_SETTINGS.openaiApiKey),
		openaiBaseUrl: normalizeUrlString(value.openaiBaseUrl, DEFAULT_SETTINGS.openaiBaseUrl),
		openaiModel: normalizeRequiredString(value.openaiModel, DEFAULT_SETTINGS.openaiModel),
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

export function normalizeMaximumInterval(value: unknown): number {
	return Math.max(1, Math.round(clampNumber(value, 1, Number.MAX_SAFE_INTEGER, DEFAULT_SETTINGS.fsrsMaximumInterval)));
}

export function normalizePositiveInteger(value: unknown, fallback: number): number {
	return Math.max(1, Math.round(clampNumber(value, 1, Number.MAX_SAFE_INTEGER, fallback)));
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
	return value === "openai" || value === "mock"
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
