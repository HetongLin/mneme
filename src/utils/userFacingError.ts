const DEFAULT_MAX_LENGTH = 180;

export function formatUserFacingError(
	error: unknown,
	fallback: string,
	maxLength = DEFAULT_MAX_LENGTH,
): string {
	const rawMessage = error instanceof Error
		? error.message
		: typeof error === "string"
			? error
			: fallback;

	return formatUserFacingMessage(rawMessage, fallback, maxLength);
}

export function formatUserFacingMessage(
	message: string,
	fallback: string,
	maxLength = DEFAULT_MAX_LENGTH,
): string {
	const normalizedFallback = normalizeMessage(fallback) || "The operation failed.";
	const normalized = normalizeMessage(message) || normalizedFallback;
	const safeMaxLength = Math.max(20, maxLength);

	if (normalized.length <= safeMaxLength) {
		return normalized;
	}

	return `${normalized.slice(0, safeMaxLength - 3).trimEnd()}...`;
}

function normalizeMessage(message: string): string {
	return message.replace(/\s+/gu, " ").trim();
}
