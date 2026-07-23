import type { ConceptSummary } from "../models/conceptLibrary";

export interface ConceptTagCatalogEntry {
	tag: string;
	usageCount: number;
}

export interface ConceptTagSimilarity {
	score: number;
	tag: string;
}

export interface ConceptTagSuggestionOptions {
	context?: string;
	limit?: number;
	query?: string;
	selectedTags?: string[];
}

export interface ReconciledConceptTags {
	similar: Array<{ proposedTag: string; suggestions: ConceptTagSimilarity[] }>;
	tags: string[];
}

export function buildConceptTagCatalog(concepts: ConceptSummary[]): ConceptTagCatalogEntry[] {
	return buildConceptTagCatalogFromTags(concepts.flatMap((concept) => concept.tags ?? []));
}

export function buildConceptTagCatalogFromTags(tags: string[]): ConceptTagCatalogEntry[] {
	const counts = new Map<string, number>();

	for (const value of tags) {
		const tag = normalizeEnglishTagSlug(value);
		if (!tag) continue;
		counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([tag, usageCount]) => ({ tag, usageCount }))
		.sort((left, right) => left.tag.localeCompare(right.tag));
}

export function normalizeEnglishTagSlug(value: string): string | undefined {
	const normalized = value
		.normalize("NFKC")
		.trim()
		.replace(/^#+/, "")
		.replace(/^['"]|['"]$/g, "")
		.trim()
		.toLocaleLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9/-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/\/{2,}/g, "/")
		.replace(/^[-/]+|[-/]+$/g, "");

	return /[a-z]/u.test(normalized) && /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/u.test(normalized)
		? normalized
		: undefined;
}

export function suggestConceptTags(
	catalog: ConceptTagCatalogEntry[],
	options: ConceptTagSuggestionOptions = {},
): ConceptTagCatalogEntry[] {
	const query = normalizeEnglishTagSlug(options.query ?? "") ?? "";
	const contextTokens = tokenize(options.context ?? "");
	const selected = new Set((options.selectedTags ?? []).map((tag) => normalizeEnglishTagSlug(tag) ?? tag));
	const limit = Math.max(1, options.limit ?? 6);

	return catalog
		.filter((entry) => !selected.has(entry.tag))
		.map((entry) => ({ entry, score: scoreSuggestion(entry, query, contextTokens) }))
		.filter(({ score }) => !query || score > 0)
		.sort((left, right) => right.score - left.score
			|| right.entry.usageCount - left.entry.usageCount
			|| left.entry.tag.localeCompare(right.entry.tag))
		.slice(0, limit)
		.map(({ entry }) => entry);
}

export function findSimilarConceptTags(
	value: string,
	catalog: ConceptTagCatalogEntry[],
	limit = 3,
): ConceptTagSimilarity[] {
	const candidate = normalizeEnglishTagSlug(value);
	if (!candidate) return [];

	return catalog
		.filter((entry) => entry.tag !== candidate)
		.map((entry) => ({ score: tagSimilarity(candidate, entry.tag), tag: entry.tag }))
		.filter(({ score }) => score >= 0.55)
		.sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag))
		.slice(0, Math.max(0, limit));
}

export function reconcileGeneratedConceptTags(
	values: string[],
	catalog: ConceptTagCatalogEntry[],
): ReconciledConceptTags {
	const existing = new Map(catalog.map((entry) => [entry.tag, entry.tag]));
	const tags: string[] = [];

	for (const value of values) {
		const normalized = normalizeEnglishTagSlug(value);
		if (!normalized) continue;
		const tag = existing.get(normalized) ?? normalized;
		if (!tags.includes(tag)) tags.push(tag);
		if (tags.length >= 3) break;
	}

	return {
		similar: tags.flatMap((tag) => {
			if (existing.has(tag)) return [];
			const suggestions = findSimilarConceptTags(tag, catalog);
			return suggestions.length > 0 ? [{ proposedTag: tag, suggestions }] : [];
		}),
		tags,
	};
}

function scoreSuggestion(
	entry: ConceptTagCatalogEntry,
	query: string,
	contextTokens: Set<string>,
): number {
	let score = Math.min(entry.usageCount, 10) * 3;

	if (query) {
		if (entry.tag === query) score += 1_000;
		else if (entry.tag.startsWith(query)) score += 800;
		else if (entry.tag.includes(query)) score += 600;
		else {
			const similarity = tagSimilarity(query, entry.tag);
			if (similarity < 0.4) return 0;
			score += similarity * 400;
		}
	}

	for (const token of tokenize(entry.tag)) {
		if (token.length > 2 && contextTokens.has(token)) score += 50;
	}

	return score;
}

function tagSimilarity(left: string, right: string): number {
	if (left === right) return 1;
	const leftTokens = tokenize(left);
	const rightTokens = tokenize(right);
	const commonTokens = [...leftTokens].filter((token) => rightTokens.has(token)).length;
	const tokenContainment = commonTokens / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
	const containment = left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))
		? 0.8
		: 0;
	const editSimilarity = 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length, 1);

	return Math.max(tokenContainment, containment, editSimilarity);
}

function tokenize(value: string): Set<string> {
	return new Set(value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter(Boolean));
}

function levenshteinDistance(left: string, right: string): number {
	const previous = Array.from({ length: right.length + 1 }, (_value, index) => index);

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
			current[rightIndex] = Math.min(
				(current[rightIndex - 1] ?? 0) + 1,
				(previous[rightIndex] ?? 0) + 1,
				(previous[rightIndex - 1] ?? 0) + substitutionCost,
			);
		}
		previous.splice(0, previous.length, ...current);
	}

	return previous[right.length] ?? 0;
}
