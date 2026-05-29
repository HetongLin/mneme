export interface MnemeSettings {
	fsrsEnableFuzz: boolean;
	fsrsMaximumInterval: number;
	fsrsRequestRetention: number;
}

export const DEFAULT_SETTINGS: MnemeSettings = {
	fsrsEnableFuzz: false,
	fsrsMaximumInterval: 36500,
	fsrsRequestRetention: 0.9,
};

export function normalizeSettings(value: unknown): MnemeSettings {
	if (!isObject(value)) {
		return { ...DEFAULT_SETTINGS };
	}

	return {
		fsrsEnableFuzz: typeof value.fsrsEnableFuzz === "boolean"
			? value.fsrsEnableFuzz
			: DEFAULT_SETTINGS.fsrsEnableFuzz,
		fsrsMaximumInterval: normalizeMaximumInterval(value.fsrsMaximumInterval),
		fsrsRequestRetention: normalizeRetention(value.fsrsRequestRetention),
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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, value));
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
