export function isMnemeConceptFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	return isRecord(frontmatter) && frontmatter.mneme_type === "concept";
}

export function isMnemeCardGroupFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	return isRecord(frontmatter) && frontmatter.mneme_type === "card_group";
}

export function getConceptIdFromFrontmatter(frontmatter: unknown): string | undefined {
	if (!isMnemeConceptFrontmatter(frontmatter)) {
		return undefined;
	}

	return getString(frontmatter, "mneme_id");
}

export function getCardGroupConceptIdFromFrontmatter(frontmatter: unknown): string | undefined {
	if (!isMnemeCardGroupFrontmatter(frontmatter)) {
		return undefined;
	}

	return getString(frontmatter, "mneme_concept_id");
}

export function getCardGroupLinkFromConceptFrontmatter(frontmatter: unknown): string | undefined {
	if (!isMnemeConceptFrontmatter(frontmatter)) {
		return undefined;
	}

	return getString(frontmatter, "cards");
}

export function getConceptLinkFromCardGroupFrontmatter(frontmatter: unknown): string | undefined {
	if (!isMnemeCardGroupFrontmatter(frontmatter)) {
		return undefined;
	}

	return getString(frontmatter, "concept");
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];

	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
