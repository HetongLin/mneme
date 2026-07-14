import type { ConceptSummary } from "../models/conceptLibrary";
import { detectConceptDuplicates } from "./conceptDuplicateDetector";

const MANUAL_DRAFT_CONCEPT_ID = "mneme:manual-concept-draft";

export interface ManualConceptDuplicateMatch {
	concept: ConceptSummary;
	reasons: string[];
	score: number;
}

export interface ManualConceptDuplicateAssessment {
	exact?: ConceptSummary;
	possible: ManualConceptDuplicateMatch[];
}

export function assessManualConceptDuplicates(
	title: string,
	coreMeaning: string,
	existingConcepts: ConceptSummary[],
): ManualConceptDuplicateAssessment {
	const normalizedTitle = normalizeTitle(title);
	const exact = existingConcepts.find((concept) => normalizeTitle(concept.title) === normalizedTitle);
	const draft: ConceptSummary = {
		conceptId: MANUAL_DRAFT_CONCEPT_ID,
		coreMeaning,
		path: "",
		title,
	};
	const possible = detectConceptDuplicates([...existingConcepts, draft])
		.filter((candidate) => (
			candidate.first.conceptId === MANUAL_DRAFT_CONCEPT_ID
			|| candidate.second.conceptId === MANUAL_DRAFT_CONCEPT_ID
		))
		.map((candidate) => ({
			concept: candidate.first.conceptId === MANUAL_DRAFT_CONCEPT_ID
				? candidate.second
				: candidate.first,
			reasons: [...candidate.reasons],
			score: candidate.score,
		}))
		.filter((match) => match.concept.conceptId !== exact?.conceptId);

	return { exact, possible };
}

function normalizeTitle(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gu, "").trim();
}
