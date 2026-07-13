import type { CardDraftType } from "../models/knowledgeProposal";

export const CARD_MARKER_SECTIONS = ["FRONT", "BACK", "RUBRIC"] as const;

export type CardMarkerSection = typeof CARD_MARKER_SECTIONS[number];

export type CardMarkerIssueCode =
	| "missing_required_section"
	| "missing_recommended_section"
	| "duplicate_section"
	| "unclosed_section"
	| "orphan_end_marker"
	| "malformed_card_block"
	| "missing_explicit_card_id";

export interface CardMarkerIssue {
	code: CardMarkerIssueCode;
	message: string;
	section: CardMarkerSection;
}

export interface ParsedCardMarkers {
	back: string;
	cardBlockIndex: number;
	cardType?: CardDraftType;
	errors: CardMarkerIssue[];
	explicitCardId?: string;
	front: string;
	hasExplicitCardId: boolean;
	isValid: boolean;
	rubric: string;
	warnings: CardMarkerIssue[];
}

interface CardBlockMatch {
	cardType?: CardDraftType;
	content: string;
	explicitCardId?: string;
}

interface SectionMarkers {
	end: string;
	section: CardMarkerSection;
	start: string;
}

const CARD_BLOCK_MARKERS = {
	end: "<!-- MNEME:CARD:end -->",
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
		cardBlockIndex: 0,
		errors,
		front,
		hasExplicitCardId: false,
		isValid: errors.length === 0,
		rubric,
		warnings,
	};
}

export function parseMnemeCards(markdown: string): ParsedCardMarkers[] {
	const cardBlocks = getCardBlockMatches(markdown);
	const startCount = countCardStartMarkers(markdown);
	const endCount = countOccurrences(markdown, CARD_BLOCK_MARKERS.end);
	const hasCardMarkers = startCount > 0 || endCount > 0;

	if (!hasCardMarkers) {
		if (isEmptyCardGroup(markdown)) {
			return [];
		}
		return [addCardIdentityMetadata(parseCardMarkers(markdown), 0)];
	}

	const parsedCards = cardBlocks.map((block, index) => {
		return addCardIdentityMetadata(parseCardMarkers(block.content), index, block.explicitCardId, block.cardType);
	});
	const malformedErrors = createCardBlockErrors(startCount, endCount, cardBlocks.length);

	if (malformedErrors.length === 0) {
		return parsedCards;
	}

	return [
		...parsedCards,
		createInvalidCardBlockResult(malformedErrors),
	];
}

function isEmptyCardGroup(markdown: string): boolean {
	const isCardGroup = /^---\r?\n[\s\S]*?^mneme_type\s*:\s*["']?card_group["']?\s*(?:#.*)?$[\s\S]*?^---(?:\r?\n|$)/m.test(markdown);
	const hasSectionMarker = /<!--\s*MNEME:(?:FRONT|BACK|RUBRIC):(start|end)\s*-->/.test(markdown);

	return isCardGroup && !hasSectionMarker;
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

function getCardBlockMatches(markdown: string): CardBlockMatch[] {
	const pattern = /<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g;

	return Array.from(markdown.matchAll(pattern), (match) => {
		return {
			cardType: parseCardTypeAttribute(match[1] ?? ""),
			content: match[2] ?? "",
			explicitCardId: parseCardIdAttribute(match[1] ?? ""),
		};
	});
}

function addCardIdentityMetadata(
	parsed: ParsedCardMarkers,
	cardBlockIndex: number,
	explicitCardId?: string,
	cardType?: CardDraftType,
): ParsedCardMarkers {
	const warnings = [...parsed.warnings];

	if (!explicitCardId) {
		warnings.push(createIssue(
			"missing_explicit_card_id",
			"FRONT",
			"Card has no explicit id; using fallback identity.",
		));
	}

	return {
		...parsed,
		cardBlockIndex,
		cardType,
		explicitCardId,
		hasExplicitCardId: explicitCardId !== undefined,
		warnings,
	};
}

function parseCardTypeAttribute(attributes: string): CardDraftType | undefined {
	const quoted = /\btype\s*=\s*"([^"]+)"/.exec(attributes)
		?? /\btype\s*=\s*'([^']+)'/.exec(attributes);
	const value = quoted?.[1] ?? /\btype\s*=\s*([^\s>]+)/.exec(attributes)?.[1];
	return isCardType(value) ? value : undefined;
}

function isCardType(value: string | undefined): value is CardDraftType {
	return value === "definition" || value === "distinction" || value === "procedure"
		|| value === "example" || value === "trap" || value === "proof"
		|| value === "application" || value === "mastery" || value === "other";
}

function parseCardIdAttribute(attributes: string): string | undefined {
	const quotedMatch = /\bid\s*=\s*"([^"]+)"/.exec(attributes)
		?? /\bid\s*=\s*'([^']+)'/.exec(attributes);

	if (quotedMatch?.[1]) {
		return quotedMatch[1].trim() || undefined;
	}

	const unquotedMatch = /\bid\s*=\s*([^\s>]+)/.exec(attributes);

	return unquotedMatch?.[1]?.trim() || undefined;
}

function countCardStartMarkers(markdown: string): number {
	return Array.from(markdown.matchAll(/<!--\s*MNEME:CARD:start\b[^>]*-->/g)).length;
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
		cardBlockIndex: 0,
		errors,
		front: "",
		hasExplicitCardId: false,
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
