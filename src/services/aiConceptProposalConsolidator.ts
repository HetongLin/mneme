import type { AiConceptProposalV1, AiSourceEvidenceV1 } from "./aiProposalSchema";

export interface AiConceptProposalConsolidation {
	deduplicatedCount: number;
	proposals: AiConceptProposalV1[];
}

export function consolidateAiConceptProposals(
	proposals: AiConceptProposalV1[],
): AiConceptProposalConsolidation {
	const consolidated: AiConceptProposalV1[] = [];
	const indexByKey = new Map<string, number>();
	let deduplicatedCount = 0;

	for (const proposal of proposals) {
		const key = createProposalKey(proposal);
		const existingIndex = indexByKey.get(key);

		if (existingIndex === undefined) {
			indexByKey.set(key, consolidated.length);
			consolidated.push(proposal);
			continue;
		}

		const existing = consolidated[existingIndex];
		if (!existing) continue;
		consolidated[existingIndex] = mergeMatchingProposals(existing, proposal);
		deduplicatedCount += 1;
	}

	return { deduplicatedCount, proposals: consolidated };
}

function createProposalKey(proposal: AiConceptProposalV1): string {
	switch (proposal.kind) {
		case "new_concept":
			return `new:${normalizeText(proposal.payload.conceptTitle)}`;
		case "link_existing_concept":
			return `link:${proposal.payload.existingConceptId}`;
		case "add_view":
			return `view:${proposal.payload.targetConceptId}:${normalizeText(proposal.payload.viewTitle)}`;
		case "update_concept":
			return [
				"update",
				proposal.payload.targetConceptId,
				normalizeText(proposal.payload.proposedCoreMeaning ?? ""),
				normalizeText(proposal.payload.proposedWhyItMatters ?? ""),
			].join(":");
	}
}

function mergeMatchingProposals(
	first: AiConceptProposalV1,
	second: AiConceptProposalV1,
): AiConceptProposalV1 {
	if (first.kind !== second.kind) return first;
	const preferred = second.confidence > first.confidence ? second : first;
	const evidence = mergeEvidence(first.evidence, second.evidence);

	if (preferred.kind === "new_concept" && first.kind === "new_concept" && second.kind === "new_concept") {
		return {
			...preferred,
			evidence,
			payload: {
				...preferred.payload,
				relatedConceptHints: uniqueStrings([
					...first.payload.relatedConceptHints,
					...second.payload.relatedConceptHints,
				]),
				tags: uniqueStrings([...first.payload.tags, ...second.payload.tags]).slice(0, 5),
				views: uniqueBy(
					[...first.payload.views, ...second.payload.views],
					(view) => `${normalizeText(view.title)}\u0000${normalizeText(view.body)}`,
				),
			},
		};
	}

	return { ...preferred, evidence } as AiConceptProposalV1;
}

function mergeEvidence(first: AiSourceEvidenceV1[], second: AiSourceEvidenceV1[]): AiSourceEvidenceV1[] {
	return uniqueBy([...first, ...second], (item) => `${item.sourcePath}\u0000${item.quote}`);
}

function uniqueStrings(values: string[]): string[] {
	return uniqueBy(values, (value) => normalizeText(value));
}

function uniqueBy<T>(values: T[], keyFactory: (value: T) => string): T[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = keyFactory(value);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function normalizeText(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gu, " ").trim();
}
