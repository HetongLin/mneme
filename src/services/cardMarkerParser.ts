export const CARD_MARKER_SECTIONS = ["FRONT", "BACK", "RUBRIC"] as const;

export type CardMarkerSection = typeof CARD_MARKER_SECTIONS[number];

export type CardMarkerIssueCode =
	| "missing_required_section"
	| "missing_recommended_section"
	| "duplicate_section"
	| "unclosed_section"
	| "orphan_end_marker"
	| "malformed_card_block";

export interface CardMarkerIssue {
	code: CardMarkerIssueCode;
	message: string;
	section: CardMarkerSection;
}

export interface ParsedCardMarkers {
	back: string;
	errors: CardMarkerIssue[];
	front: string;
	isValid: boolean;
	rubric: string;
	warnings: CardMarkerIssue[];
}

interface SectionMarkers {
	end: string;
	section: CardMarkerSection;
	start: string;
}

const CARD_BLOCK_MARKERS = {
	end: "<!-- MNEME:CARD:end -->",
	start: "<!-- MNEME:CARD:start -->",
};

const SECTION_MARKERS: Record<CardMarkerSection, SectionMarkers> = {
	FRONT: createSectionMarkers("FRONT"),
	BACK: createSectionMarkers("BACK"),
	RUBRIC: createSectionMarkers("RUBRIC"),
};

export function parseCardMarkers(markdown: string): ParsedCardMarkers {
	const errors: CardMarkerIssue[] = [];
	const warnings: CardMarkerIssue[] = [];

	const front = parseSection(markdown, SECTION_MARKERS.FRONT, errors, warnings, true);
	const back = parseSection(markdown, SECTION_MARKERS.BACK, errors, warnings, true);
	const rubric = parseSection(markdown, SECTION_MARKERS.RUBRIC, errors, warnings, false);

	return {
		back,
		errors,
		front,
		isValid: errors.length === 0,
		rubric,
		warnings,
	};
}

export function parseMnemeCards(markdown: string): ParsedCardMarkers[] {
	const cardBlocks = getCardBlockMatches(markdown);
	const startCount = countOccurrences(markdown, CARD_BLOCK_MARKERS.start);
	const endCount = countOccurrences(markdown, CARD_BLOCK_MARKERS.end);
	const hasCardMarkers = startCount > 0 || endCount > 0;

	if (!hasCardMarkers) {
		return [parseCardMarkers(markdown)];
	}

	const parsedCards = cardBlocks.map((block) => parseCardMarkers(block));
	const malformedErrors = createCardBlockErrors(startCount, endCount, cardBlocks.length);

	if (malformedErrors.length === 0) {
		return parsedCards;
	}

	return [
		...parsedCards,
		createInvalidCardBlockResult(malformedErrors),
	];
}

function parseSection(
	markdown: string,
	markers: SectionMarkers,
	errors: CardMarkerIssue[],
	warnings: CardMarkerIssue[],
	isRequired: boolean,
): string {
	const completeMatches = getCompleteSectionMatches(markdown, markers);
	const startCount = countOccurrences(markdown, markers.start);
	const endCount = countOccurrences(markdown, markers.end);

	if (completeMatches.length === 0) {
		if (isRequired) {
			errors.push(createIssue(
				"missing_required_section",
				markers.section,
				`${markers.section} marker section is required.`,
			));
		} else {
			warnings.push(createIssue(
				"missing_recommended_section",
				markers.section,
				`${markers.section} marker section is recommended.`,
			));
		}
	}

	if (completeMatches.length > 1) {
		errors.push(createIssue(
			"duplicate_section",
			markers.section,
			`${markers.section} marker section appears more than once.`,
		));
	}

	if (startCount > completeMatches.length) {
		errors.push(createIssue(
			"unclosed_section",
			markers.section,
			`${markers.section} start marker has no matching end marker.`,
		));
	}

	if (endCount > completeMatches.length) {
		errors.push(createIssue(
			"orphan_end_marker",
			markers.section,
			`${markers.section} end marker has no matching start marker.`,
		));
	}

	return completeMatches[0]?.trim() ?? "";
}

function createSectionMarkers(section: CardMarkerSection): SectionMarkers {
	return {
		end: `<!-- MNEME:${section}:end -->`,
		section,
		start: `<!-- MNEME:${section}:start -->`,
	};
}

function getCompleteSectionMatches(markdown: string, markers: SectionMarkers): string[] {
	const pattern = new RegExp(`${escapeRegExp(markers.start)}([\\s\\S]*?)${escapeRegExp(markers.end)}`, "g");

	return Array.from(markdown.matchAll(pattern), (match) => match[1] ?? "");
}

function getCardBlockMatches(markdown: string): string[] {
	const pattern = new RegExp(`${escapeRegExp(CARD_BLOCK_MARKERS.start)}([\\s\\S]*?)${escapeRegExp(CARD_BLOCK_MARKERS.end)}`, "g");

	return Array.from(markdown.matchAll(pattern), (match) => match[1] ?? "");
}

function createCardBlockErrors(
	startCount: number,
	endCount: number,
	completeBlockCount: number,
): CardMarkerIssue[] {
	const errors: CardMarkerIssue[] = [];

	if (startCount > completeBlockCount) {
		errors.push(createIssue(
			"malformed_card_block",
			"FRONT",
			"CARD start marker has no matching CARD end marker.",
		));
	}

	if (endCount > completeBlockCount) {
		errors.push(createIssue(
			"malformed_card_block",
			"FRONT",
			"CARD end marker has no matching CARD start marker.",
		));
	}

	return errors;
}

function createInvalidCardBlockResult(errors: CardMarkerIssue[]): ParsedCardMarkers {
	return {
		back: "",
		errors,
		front: "",
		isValid: false,
		rubric: "",
		warnings: [],
	};
}

function countOccurrences(markdown: string, needle: string): number {
	if (needle.length === 0) {
		return 0;
	}

	return markdown.split(needle).length - 1;
}

function createIssue(
	code: CardMarkerIssueCode,
	section: CardMarkerSection,
	message: string,
): CardMarkerIssue {
	return {
		code,
		message,
		section,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
