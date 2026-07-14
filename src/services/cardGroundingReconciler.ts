import type {
	AiCardGenerationResponseV1,
	AiSourceEvidenceV1,
} from "./aiProposalSchema";

export interface CardGroundingReconciliation {
	discardedEvidenceCount: number;
	discardedProposalCount: number;
	repairedEvidenceCount: number;
	response: AiCardGenerationResponseV1;
}

export function reconcileCardGrounding(
	response: AiCardGenerationResponseV1,
	learningContent: string,
	conceptPath: string,
): CardGroundingReconciliation {
	let discardedEvidenceCount = 0;
	let discardedProposalCount = 0;
	let repairedEvidenceCount = 0;
	const proposals: AiCardGenerationResponseV1["proposals"] = [];

	for (const proposal of response.proposals) {
		const evidence: AiSourceEvidenceV1[] = [];

		for (const item of proposal.evidence) {
			if (item.sourcePath !== conceptPath) {
				discardedEvidenceCount += 1;
				continue;
			}

			const exactQuote = resolveGroundingQuote(learningContent, item.quote);
			if (!exactQuote) {
				discardedEvidenceCount += 1;
				continue;
			}

			if (exactQuote !== item.quote) repairedEvidenceCount += 1;
			evidence.push({ ...item, quote: exactQuote });
		}

		if (evidence.length === 0) {
			discardedProposalCount += 1;
			continue;
		}

		proposals.push({ ...proposal, evidence });
	}

	const warnings = [...response.warnings];
	if (repairedEvidenceCount > 0) {
		warnings.push(`Mneme restored ${repairedEvidenceCount} grounding quote${repairedEvidenceCount === 1 ? "" : "s"} to exact Concept Markdown.`);
	}
	if (discardedEvidenceCount > 0) {
		warnings.push(`Mneme ignored ${discardedEvidenceCount} grounding item${discardedEvidenceCount === 1 ? "" : "s"} that could not be verified.`);
	}
	if (discardedProposalCount > 0 && proposals.length > 0) {
		warnings.push(`Mneme ignored ${discardedProposalCount} ungrounded Card proposal${discardedProposalCount === 1 ? "" : "s"}.`);
	}

	return {
		discardedEvidenceCount,
		discardedProposalCount,
		repairedEvidenceCount,
		response: { ...response, proposals, warnings },
	};
}

export function resolveGroundingQuote(source: string, quote: string): string | undefined {
	const trimmedQuote = quote.trim();
	if (!trimmedQuote) return undefined;
	if (source.includes(trimmedQuote)) return trimmedQuote;

	return findCanonicalSourceExcerpt(source, trimmedQuote, false)
		?? findCanonicalSourceExcerpt(source, trimmedQuote, true);
}

function findCanonicalSourceExcerpt(
	source: string,
	quote: string,
	ignoreMathDelimiters: boolean,
): string | undefined {
	const canonicalSource = canonicalize(source, ignoreMathDelimiters);
	const canonicalQuote = canonicalize(quote, ignoreMathDelimiters).text;
	if (!canonicalQuote) return undefined;
	const matchIndex = canonicalSource.text.indexOf(canonicalQuote);
	if (matchIndex < 0) return undefined;

	const start = canonicalSource.sourceIndexes[matchIndex];
	const end = canonicalSource.sourceIndexes[matchIndex + canonicalQuote.length - 1];
	if (start === undefined || end === undefined) return undefined;

	const [excerptStart, excerptEnd] = ignoreMathDelimiters
		? expandAdjacentMathDelimiters(source, start, end + 1)
		: [start, end + 1];

	return source.slice(excerptStart, excerptEnd).trim() || undefined;
}

function expandAdjacentMathDelimiters(source: string, start: number, end: number): [number, number] {
	let excerptStart = start;
	let excerptEnd = end;
	while (excerptStart > 0 && source[excerptStart - 1] === "$") excerptStart -= 1;

	let trailingIndex = excerptEnd;
	while (trailingIndex < source.length && /\s/u.test(source[trailingIndex]!)) trailingIndex += 1;
	if (source[trailingIndex] === "$") {
		excerptEnd = trailingIndex;
		while (excerptEnd < source.length && source[excerptEnd] === "$") excerptEnd += 1;
	}

	return [excerptStart, excerptEnd];
}

function canonicalize(
	value: string,
	ignoreMathDelimiters: boolean,
): { sourceIndexes: number[]; text: string } {
	const characters: string[] = [];
	const sourceIndexes: number[] = [];

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]!;
		if (ignoreMathDelimiters && character === "$") continue;

		if (/\s/u.test(character)) {
			if (characters.length === 0 || characters[characters.length - 1] === " ") continue;
			characters.push(" ");
			sourceIndexes.push(index);
			continue;
		}

		characters.push(character);
		sourceIndexes.push(index);
	}

	if (characters[characters.length - 1] === " ") {
		characters.pop();
		sourceIndexes.pop();
	}

	return { sourceIndexes, text: characters.join("") };
}
