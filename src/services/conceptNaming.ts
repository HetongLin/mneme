const TRAILING_ENGLISH_NAME = /^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/u;

export function composeConceptDisplayTitle(title: string, englishName: string): string {
	const primary = title.trim();
	const english = englishName.trim();
	if (!primary) return english;
	if (!shouldOfferEnglishAlias(primary)) return primary;
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

	return undefined;
}

export function isCanonicalEnglishName(value: string | undefined): boolean {
	const normalized = value?.trim() ?? "";
	let hasLatinLetter = false;

	for (const character of normalized) {
		if (!/\p{L}/u.test(character)) continue;
		if (!/\p{Script=Latin}/u.test(character)) return false;
		hasLatinLetter = true;
	}

	return hasLatinLetter;
}

export function shouldOfferEnglishAlias(title: string): boolean {
	let hasLatinLetter = false;

	for (const character of title) {
		if (!/\p{L}/u.test(character)) continue;
		if (!/\p{Script=Latin}/u.test(character)) return true;
		hasLatinLetter = true;
	}

	return !hasLatinLetter;
}

export function normalizeConceptNames(
	title: string,
	englishName?: string,
	allowEnglishAlias = true,
): { displayTitle: string; englishName: string; title: string } {
	const enteredTitle = title.trim();
	if (!allowEnglishAlias) {
		return {
			displayTitle: enteredTitle,
			englishName: "",
			title: enteredTitle,
		};
	}

	const legacyCombinedTitle = splitLegacyCombinedConceptTitle(enteredTitle);
	const primaryTitle = legacyCombinedTitle?.title ?? enteredTitle;
	const canonicalEnglishName = shouldOfferEnglishAlias(primaryTitle)
		? resolveConceptEnglishName(englishName, enteredTitle) ?? ""
		: "";

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

function containsHanCharacter(value: string): boolean {
	return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}
