export function isCardFile(file: { name: string }, frontmatter?: unknown): boolean {
	return file.name === "Card.md"
		|| file.name === "Cards.md"
		|| isMnemeCardFrontmatter(frontmatter);
}

function isMnemeCardFrontmatter(frontmatter: unknown): boolean {
	return isRecord(frontmatter)
		&& (frontmatter.mneme_type === "card" || frontmatter.mneme_type === "card_group");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
