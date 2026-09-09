import type { ConceptIdentityIssue } from "../models/conceptLibrary";
import {
	getCardGroupConceptIdFromFrontmatter,
	getCardGroupPathFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
	isMnemeConceptFrontmatter,
} from "./conceptMarkdownIdentity";
import { normalizeVaultPath } from "../utils/markdownPath";

export interface ConceptIdentityReference {
	path: string;
	frontmatter: unknown;
}

/** Repair may update only the selected Concept's exclusively linked Card Group. */
export function assertConceptIdRepairOwnership(
	issue: ConceptIdentityIssue,
	newConceptId: string,
	currentFrontmatter: unknown,
	cardFrontmatter: unknown,
	references: readonly ConceptIdentityReference[],
): void {
	if (!isMnemeConceptFrontmatter(currentFrontmatter)
		|| getConceptIdFromFrontmatter(currentFrontmatter) !== issue.conceptId) {
		throw new Error("Concept identity changed. Refresh Concept Library before repairing it.");
	}
	const cardsPath = getCardGroupPathFromConceptFrontmatter(currentFrontmatter);
	if (normalized(cardsPath) !== normalized(issue.cardsPath)) {
		throw new Error("The linked Card Group changed. Refresh Concept Library before repairing the ID.");
	}
	const others = references.filter((reference) => normalized(reference.path) !== normalized(issue.path)
		&& isMnemeConceptFrontmatter(reference.frontmatter));
	if (newConceptId === issue.conceptId || others.some((other) => getConceptIdFromFrontmatter(other.frontmatter) === newConceptId)) {
		throw new Error("That Concept ID already exists in the vault.");
	}
	if (!cardsPath) return;
	if (!/\.md$/i.test(cardsPath) || !cardFrontmatter || typeof cardFrontmatter !== "object"
		|| (cardFrontmatter as Record<string, unknown>).mneme_type !== "card_group") {
		throw new Error("The linked Card Group is missing or invalid. Repair its Markdown link first.");
	}
	if (others.some((other) => {
		const otherCards = getCardGroupPathFromConceptFrontmatter(other.frontmatter);
		return !!otherCards && (normalized(otherCards) === normalized(cardsPath)
			|| (!/\.md$/i.test(otherCards) && normalized(cardsPath)!.startsWith(`${normalized(otherCards)}/`)));
	})) {
		throw new Error("Another Concept links to this Card Group. Resolve the shared link before repairing the ID.");
	}
	const owner = getCardGroupConceptIdFromFrontmatter(cardFrontmatter);
	if (owner && (issue.conceptId ? owner !== issue.conceptId
		: others.some((other) => getConceptIdFromFrontmatter(other.frontmatter) === owner))) {
		throw new Error("The linked Card Group belongs to another Concept. Its owner was preserved.");
	}
}

function normalized(path: string | undefined): string | undefined {
	return path === undefined ? undefined : normalizeVaultPath(path);
}
