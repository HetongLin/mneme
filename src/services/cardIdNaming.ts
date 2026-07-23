import type { CardDraftType } from "../models/knowledgeProposal";
import { normalizeVaultPath, slugifyForFilename } from "../utils/markdownPath";

export function createReadableCardIdBase(
	conceptId: string | undefined,
	cardType: CardDraftType | string | undefined,
): string {
	return createReadableCardIdBaseFromStem(stripConceptIdPrefix(conceptId ?? "concept"), cardType);
}

export function createReadableCardIdBaseFromStem(
	conceptStem: string | undefined,
	cardType: CardDraftType | string | undefined,
): string {
	const conceptSegment = normalizeCardIdSegment(conceptStem ?? "concept");
	const typeSegment = normalizeCardIdSegment(cardType ?? "card");
	const base = [conceptSegment, typeSegment].filter(Boolean).join("-");

	return base || "mneme-card";
}

export function createReadableCardId(
	conceptId: string | undefined,
	cardType: CardDraftType | string | undefined,
	reservedIds: ReadonlySet<string> = new Set(),
): string {
	return createUniqueReadableCardId(createReadableCardIdBase(conceptId, cardType), reservedIds);
}

export function createReadableCardIdFromStem(
	conceptStem: string | undefined,
	cardType: CardDraftType | string | undefined,
	reservedIds: ReadonlySet<string> = new Set(),
): string {
	return createUniqueReadableCardId(createReadableCardIdBaseFromStem(conceptStem, cardType), reservedIds);
}

export function createUniqueReadableCardId(base: string, reservedIds: ReadonlySet<string>): string {
	const normalizedBase = normalizeCardIdSegment(base) || "mneme-card";

	if (!reservedIds.has(normalizedBase)) {
		return normalizedBase;
	}

	let suffix = 2;
	let candidate = `${normalizedBase}-${suffix}`;

	while (reservedIds.has(candidate)) {
		suffix += 1;
		candidate = `${normalizedBase}-${suffix}`;
	}

	return candidate;
}

export function getCardIdConceptStemFromCardGroupPath(path: string, fallback: string): string {
	const parts = normalizeVaultPath(path).split("/").filter(Boolean);
	const filename = parts.pop() ?? "";

	if (/^Cards\.md$/i.test(filename)) {
		return parts.pop() ?? fallback;
	}

	return filename.replace(/\.md$/i, "") || fallback;
}

export function getCardIdConceptStemFromConceptPath(path: string, fallback: string): string {
	const parts = normalizeVaultPath(path).split("/").filter(Boolean);
	const filename = parts.pop() ?? "";

	if (/^Concept\.md$/i.test(filename)) {
		return parts.pop() ?? fallback;
	}

	return filename.replace(/\.md$/i, "") || fallback;
}

function stripConceptIdPrefix(value: string): string {
	return value.replace(/^concept[-_]/i, "");
}

function normalizeCardIdSegment(value: string): string {
	return slugifyForFilename(value)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}
