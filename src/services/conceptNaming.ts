import { createMnemeConceptId } from "../utils/markdownPath";

const TRAILING_ENGLISH_NAME = /^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/u;

export function composeConceptDisplayTitle(title: string, englishName: string): string {
	const primary = title.trim();
	const english = englishName.trim();
	if (!primary) return english;
	if (!english || normalizeForComparison(primary) === normalizeForComparison(english)) return primary;

	const split = splitLegacyCombinedConceptTitle(primary);
	if (split && normalizeForComparison(split.englishName) === normalizeForComparison(english)) {
		return primary;
	}

	return `${primary} (${english})`;
}

export function resolveConceptEnglishName(englishName: string | undefined, title: string): string | undefined {
	const explicit = englishName?.trim();
	if (explicit) return explicit;

	const split = splitLegacyCombinedConceptTitle(title);
	if (split) return split.englishName;

	const normalizedTitle = title.trim();
	return containsLatinLetter(normalizedTitle) && !containsHanCharacter(normalizedTitle)
		? normalizedTitle
		: undefined;
}

export function createReadableConceptId(englishName: string): string {
	return createMnemeConceptId(englishName);
}

export function isCanonicalEnglishName(value: string | undefined): boolean {
	const normalized = value?.trim() ?? "";

	return containsLatinLetter(normalized) && !containsHanCharacter(normalized);
}

export function normalizeConceptNames(
	title: string,
	englishName?: string,
): { displayTitle: string; englishName: string; title: string } {
	const enteredTitle = title.trim();
	const legacyCombinedTitle = splitLegacyCombinedConceptTitle(enteredTitle);
	const primaryTitle = legacyCombinedTitle?.title ?? enteredTitle;
	const canonicalEnglishName = resolveConceptEnglishName(englishName, enteredTitle) ?? primaryTitle;

	return {
		displayTitle: composeConceptDisplayTitle(primaryTitle, canonicalEnglishName),
		englishName: canonicalEnglishName,
		title: primaryTitle,
	};
}

export function getConceptIdStem(conceptId: string): string {
	return conceptId.trim().replace(/^concept[-_]/i, "") || "concept";
}

export function splitLegacyCombinedConceptTitle(
	value: string,
): { englishName: string; title: string } | undefined {
	const match = TRAILING_ENGLISH_NAME.exec(value.trim());
	const title = match?.[1]?.trim();
	const englishName = match?.[2]?.trim();

	return title && englishName && containsHanCharacter(title)
		? { englishName, title }
		: undefined;
}

function normalizeForComparison(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function containsLatinLetter(value: string): boolean {
	return /[A-Za-z]/u.test(value);
}

function containsHanCharacter(value: string): boolean {
	return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}
