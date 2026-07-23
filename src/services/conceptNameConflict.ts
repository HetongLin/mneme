import type { ConceptSummary } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import { buildConceptPath, normalizeVaultPath } from "../utils/markdownPath";
import { createReadableConceptId, normalizeConceptNames } from "./conceptNaming";

export type ConceptNameConflictReason =
	| "title"
	| "english_name"
	| "concept_id"
	| "path";

export type ConceptNameConflictResolution =
	| "merge"
	| "refine_name"
	| "keep_both"
	| "cancel";

export interface ConceptNameConflict {
	candidate: {
		conceptId: string;
		displayTitle: string;
		englishName: string;
		path: string;
		title: string;
	};
	existing: ConceptSummary;
	reasons: ConceptNameConflictReason[];
}

export function findConceptNameConflict(
	input: { englishName?: string; title: string },
	settings: Pick<MnemeSettings, "conceptsFolder">,
	existingConcepts: ConceptSummary[],
): ConceptNameConflict | undefined {
	const names = normalizeConceptNames(input.title, input.englishName);
	const candidate = {
		conceptId: createReadableConceptId(names.englishName),
		displayTitle: names.displayTitle,
		englishName: names.englishName,
		path: buildConceptPath(settings.conceptsFolder, names.displayTitle),
		title: names.title,
	};

	const matches = existingConcepts
		.map((existing) => ({
			existing,
			reasons: getConflictReasons(candidate, existing),
		}))
		.filter((match) => match.reasons.length > 0)
		.sort((left, right) => conflictWeight(right.reasons) - conflictWeight(left.reasons));
	const match = matches[0];

	return match
		? {
			candidate,
			existing: match.existing,
			reasons: match.reasons,
		}
		: undefined;
}

function getConflictReasons(
	candidate: ConceptNameConflict["candidate"],
	existing: ConceptSummary,
): ConceptNameConflictReason[] {
	const reasons: ConceptNameConflictReason[] = [];
	const existingPrimaryTitle = existing.primaryTitle?.trim() || existing.title.trim();

	if (normalizeName(candidate.title) === normalizeName(existingPrimaryTitle)) {
		reasons.push("title");
	}
	if (
		existing.englishName
		&& normalizeName(candidate.englishName) === normalizeName(existing.englishName)
	) {
		reasons.push("english_name");
	}
	if (normalizeIdentity(candidate.conceptId) === normalizeIdentity(existing.conceptId)) {
		reasons.push("concept_id");
	}
	if (normalizeIdentity(candidate.path) === normalizeIdentity(existing.path)) {
		reasons.push("path");
	}

	return reasons;
}

function normalizeName(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9\u3400-\u9fff]+/gu, "");
}

function normalizeIdentity(value: string): string {
	return normalizeVaultPath(value).normalize("NFKC").toLocaleLowerCase();
}

function conflictWeight(reasons: ConceptNameConflictReason[]): number {
	return reasons.reduce((weight, reason) => (
		weight + (reason === "title" ? 8 : reason === "english_name" ? 4 : 2)
	), 0);
}
