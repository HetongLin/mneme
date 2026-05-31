import type {
	ConceptImportance,
	ConceptLibraryFilter,
	ConceptLibrarySortMode,
	ConceptSummary,
} from "../models/conceptLibrary";

const IMPORTANCE_RANK: Record<ConceptImportance, number> = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1,
};

export function filterConceptSummaries(
	concepts: ConceptSummary[],
	filter: ConceptLibraryFilter = {},
): ConceptSummary[] {
	const query = normalizeQuery(filter.query);

	return concepts.filter((concept) => {
		if (filter.learningMode && filter.learningMode !== "all" && concept.learningMode !== filter.learningMode) {
			return false;
		}

		if (filter.importance && filter.importance !== "all" && concept.importance !== filter.importance) {
			return false;
		}

		if (!query) {
			return true;
		}

		return [
			concept.title,
			concept.path,
			concept.coreMeaning,
			concept.whyItMatters,
		].some((value) => normalizeQuery(value).includes(query));
	});
}

export function sortConceptSummaries(
	concepts: ConceptSummary[],
	sortMode: ConceptLibrarySortMode = "title",
): ConceptSummary[] {
	return [...concepts].sort((first, second) => {
		switch (sortMode) {
			case "updatedAt_desc":
				return compareUpdatedAt(first, second) || compareTitle(first, second);
			case "importance_desc":
				return compareImportance(first, second) || compareTitle(first, second);
			case "title":
			default:
				return compareTitle(first, second);
		}
	});
}

function compareTitle(first: ConceptSummary, second: ConceptSummary): number {
	return first.title.localeCompare(second.title, undefined, { sensitivity: "base" })
		|| first.path.localeCompare(second.path);
}

function compareUpdatedAt(first: ConceptSummary, second: ConceptSummary): number {
	return (second.updatedAt ?? 0) - (first.updatedAt ?? 0);
}

function compareImportance(first: ConceptSummary, second: ConceptSummary): number {
	return getImportanceRank(second) - getImportanceRank(first);
}

function getImportanceRank(concept: ConceptSummary): number {
	return concept.importance ? IMPORTANCE_RANK[concept.importance] : 0;
}

function normalizeQuery(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}
