export const MIN_CONCEPT_RETENTION_TARGET = 0.7;
export const MAX_CONCEPT_RETENTION_TARGET = 0.98;

export function parseConceptRetentionTarget(value: unknown): number | undefined {
	const numeric = typeof value === "number"
		? value
		: typeof value === "string" && value.trim().length > 0
			? Number(value)
			: Number.NaN;

	if (
		!Number.isFinite(numeric)
		|| numeric < MIN_CONCEPT_RETENTION_TARGET
		|| numeric > MAX_CONCEPT_RETENTION_TARGET
	) {
		return undefined;
	}

	return Math.round(numeric * 100) / 100;
}

export function formatRetentionTarget(value: number): string {
	return value.toFixed(2);
}
