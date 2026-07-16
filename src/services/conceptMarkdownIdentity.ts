import { normalizeVaultPath } from "../utils/markdownPath";

export function isMnemeConceptFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	return isRecord(frontmatter) && frontmatter.mneme_type === "concept";
}

export function isMnemeCardGroupFrontmatter(frontmatter: unknown): frontmatter is Record<string, unknown> {
	return isRecord(frontmatter) && (frontmatter.mneme_type === "card_group" || frontmatter.mneme_type === "card");
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

	return getString(frontmatter, "cards") ?? getString(frontmatter, "cards_folder");
}

export function getCardGroupPathFromConceptFrontmatter(frontmatter: unknown): string | undefined {
	if (!isMnemeConceptFrontmatter(frontmatter)) {
		return undefined;
	}

	const cardGroupLink = getString(frontmatter, "cards");
	if (cardGroupLink) {
		const path = parseObsidianPath(cardGroupLink);

		return path && !/\.md$/i.test(path) ? `${path}.md` : path;
	}

	const legacyCardsFolder = getString(frontmatter, "cards_folder");

	return legacyCardsFolder ? parseObsidianPath(legacyCardsFolder) : undefined;
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

function parseObsidianPath(value: string): string | undefined {
	const internalLinkMatch = value.match(/^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
	const path = normalizeVaultPath(internalLinkMatch?.[1] ?? value);

	return path || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
