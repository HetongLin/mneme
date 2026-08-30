import type {
	ConceptDuplicateCandidate,
	ConceptMergeSuggestion,
	ConceptSummary,
} from "../models/conceptLibrary";

const COMMON_WORDS = new Set([
	"a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is",
	"it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which",
	"why", "with",
]);

export function detectConceptDuplicates(concepts: ConceptSummary[]): ConceptDuplicateCandidate[] {
	const candidates: ConceptDuplicateCandidate[] = [];
	const fingerprints = concepts.map(createFingerprint);

	for (let firstIndex = 0; firstIndex < fingerprints.length; firstIndex += 1) {
		for (let secondIndex = firstIndex + 1; secondIndex < fingerprints.length; secondIndex += 1) {
			const first = fingerprints[firstIndex];
			const second = fingerprints[secondIndex];
			if (!first || !second || first.concept.conceptId === second.concept.conceptId) {
				continue;
			}

			const candidate = compareConcepts(first, second);
			if (candidate) {
				candidates.push(candidate);
			}
		}
	}

	return candidates.sort((first, second) => second.score - first.score
		|| first.pairKey.localeCompare(second.pairKey));
}

export function createConceptDuplicatePairKey(firstConceptId: string, secondConceptId: string): string {
	return JSON.stringify([firstConceptId, secondConceptId].sort());
}

export function rankConceptMergeCandidates(
	selected: ConceptSummary,
	concepts: ConceptSummary[],
	limit = 8,
): ConceptMergeSuggestion[] {
	const selectedFingerprint = createFingerprint(selected);

	return concepts
		.filter((concept) => concept.conceptId !== selected.conceptId)
		.map((concept): ConceptMergeSuggestion => {
			const fingerprint = createFingerprint(concept);
			const duplicate = compareConcepts(selectedFingerprint, fingerprint);
			const titleSimilarity = jaccard(selectedFingerprint.titleTokens, fingerprint.titleTokens);
			const coreSimilarity = jaccard(selectedFingerprint.coreTokens, fingerprint.coreTokens);
			const englishSimilarity = normalizedEquality(selected.englishName, concept.englishName) ? 1 : 0;
			const tagSimilarity = jaccard(
				new Set(selected.tags ?? []),
				new Set(concept.tags ?? []),
			);
			const score = duplicate?.score
				?? Math.max(
					englishSimilarity === 1 ? 0.92 : 0,
					Math.min(0.77, titleSimilarity * 0.52 + coreSimilarity * 0.42 + tagSimilarity * 0.06),
				);
			const reasons = duplicate?.reasons ?? describeMergeSimilarity({
				coreSimilarity,
				englishSimilarity,
				tagSimilarity,
				titleSimilarity,
			});

			return {
				concept,
				pairKey: createConceptDuplicatePairKey(selected.conceptId, concept.conceptId),
				reasons,
				score,
			};
		})
		.sort((first, second) => second.score - first.score
			|| first.concept.title.localeCompare(second.concept.title, undefined, { sensitivity: "base" }))
		.slice(0, Math.max(0, limit));
}

interface ConceptFingerprint {
	concept: ConceptSummary;
	coreNormalized: string;
	coreTokens: Set<string>;
	titleNormalized: string;
	titleTokens: Set<string>;
}

function compareConcepts(first: ConceptFingerprint, second: ConceptFingerprint): ConceptDuplicateCandidate | undefined {
	const sharedTitleTokens = intersectionCount(first.titleTokens, second.titleTokens);
	const sharedCoreTokens = intersectionCount(first.coreTokens, second.coreTokens);
	const exactTitle = first.titleNormalized.length > 0 && first.titleNormalized === second.titleNormalized;
	if (!exactTitle && sharedTitleTokens === 0 && sharedCoreTokens < 4) {
		return undefined;
	}
	const titleSimilarity = jaccard(first.titleTokens, second.titleTokens, sharedTitleTokens);
	const coreSimilarity = jaccard(first.coreTokens, second.coreTokens, sharedCoreTokens);
	const exactCore = first.coreNormalized.length >= 30 && first.coreNormalized === second.coreNormalized;
	const reasons: string[] = [];
	let score = 0;

	if (exactTitle) {
		reasons.push("Same normalized title");
		score = Math.max(score, 1);
	} else if (titleSimilarity >= 0.75 && Math.min(first.titleTokens.size, second.titleTokens.size) >= 2) {
		reasons.push(`Title token overlap ${formatPercent(titleSimilarity)}`);
		score = Math.max(score, 0.82 + titleSimilarity * 0.12);
	}

	if (exactCore) {
		reasons.push("Same normalized Core Meaning");
		score = Math.max(score, 0.96);
	} else if (coreSimilarity >= 0.65 && sharedCoreTokens >= 4) {
		reasons.push(`Core Meaning token overlap ${formatPercent(coreSimilarity)}`);
		score = Math.max(score, 0.72 + coreSimilarity * 0.20);
	}

	if (score === 0 && titleSimilarity >= 0.5 && coreSimilarity >= 0.5) {
		reasons.push(`Combined title/core overlap ${formatPercent((titleSimilarity + coreSimilarity) / 2)}`);
		score = 0.72 + ((titleSimilarity + coreSimilarity) / 2) * 0.12;
	}

	if (score < 0.78 || reasons.length === 0) {
		return undefined;
	}

	return {
		first: first.concept,
		pairKey: createConceptDuplicatePairKey(first.concept.conceptId, second.concept.conceptId),
		reasons,
		score: Math.min(1, score),
		second: second.concept,
	};
}

function createFingerprint(concept: ConceptSummary): ConceptFingerprint {
	return {
		concept,
		coreNormalized: normalizeText(concept.coreMeaning ?? ""),
		coreTokens: tokenize(concept.coreMeaning ?? ""),
		titleNormalized: normalizeText(concept.title),
		titleTokens: tokenize(concept.title),
	};
}

function tokenize(value: string): Set<string> {
	const normalized = normalizeText(value);
	const tokens = new Set<string>();
	for (const token of normalized.match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? []) {
		if (/^[\u3400-\u9fff]+$/.test(token)) {
			if (token.length === 1) {
				tokens.add(token);
			} else {
				for (let index = 0; index < token.length - 1; index += 1) {
					tokens.add(token.slice(index, index + 2));
				}
			}
		} else if (!COMMON_WORDS.has(token)) {
			tokens.add(token);
		}
	}

	return tokens;
}

function normalizeText(value: string): string {
	return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim();
}

function jaccard(first: Set<string>, second: Set<string>, intersection = intersectionCount(first, second)): number {
	if (first.size === 0 || second.size === 0) {
		return 0;
	}
	return intersection / (first.size + second.size - intersection);
}

function intersectionCount(first: Set<string>, second: Set<string>): number {
	let count = 0;
	const [smaller, larger] = first.size <= second.size ? [first, second] : [second, first];
	for (const token of smaller) {
		if (larger.has(token)) {
			count += 1;
		}
	}
	return count;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function normalizedEquality(first: string | undefined, second: string | undefined): boolean {
	return !!first && !!second && normalizeText(first) === normalizeText(second);
}

function describeMergeSimilarity(input: {
	coreSimilarity: number;
	englishSimilarity: number;
	tagSimilarity: number;
	titleSimilarity: number;
}): string[] {
	const reasons: string[] = [];
	if (input.englishSimilarity === 1) reasons.push("Same English Alias");
	if (input.titleSimilarity > 0) reasons.push(`Title overlap ${formatPercent(input.titleSimilarity)}`);
	if (input.coreSimilarity > 0) reasons.push(`Core Meaning overlap ${formatPercent(input.coreSimilarity)}`);
	if (input.tagSimilarity > 0) reasons.push(`Tag overlap ${formatPercent(input.tagSimilarity)}`);
	return reasons.length > 0 ? reasons : ["Low local similarity"];
}
