import { parseMnemeCards } from "./cardMarkerParser";

export interface AssignCardIdInput {
	cardBlockIndex: number;
	expectedBack?: string;
	expectedCardId?: string;
	expectedFront?: string;
	newCardId: string;
}

export type AssignCardIdResult =
	| { markdown: string; status: "updated" }
	| { message: string; status: "conflict" | "invalid" | "not_found" };

interface CardBlockRange {
	explicitCardId?: string;
	invalidAttributes: boolean;
	markerEnd: number;
	markerStart: number;
}

const CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

export function createStableCardId(
	now = Date.now(),
	randomValue = Math.random(),
): string {
	const time = Math.max(0, Math.floor(now)).toString(36);
	const random = Math.floor(Math.max(0, Math.min(randomValue, 0.999999999999)) * 0x100000000)
		.toString(36)
		.padStart(7, "0");

	return `card_${time}_${random}`;
}

export function assignCardId(markdown: string, input: AssignCardIdInput): AssignCardIdResult {
	const newCardId = input.newCardId.trim();

	if (!CARD_ID_PATTERN.test(newCardId)) {
		return {
			message: "Card ID must be 3-128 characters using letters, numbers, underscores, or hyphens.",
			status: "invalid",
		};
	}

	const parsedBefore = parseMnemeCards(markdown);
	if (parsedBefore.some((card) => card.errors.some((issue) => issue.code === "malformed_card_block"))) {
		return { message: "Repair invalid Card markers before assigning a stable ID.", status: "invalid" };
	}
	const expectedCard = parsedBefore[input.cardBlockIndex];
	if (
		!expectedCard
		|| (input.expectedFront !== undefined && expectedCard.front !== input.expectedFront)
		|| (input.expectedBack !== undefined && expectedCard.back !== input.expectedBack)
	) {
		return { message: "Card content changed after the repair view opened.", status: "conflict" };
	}

	const blocks = getCardBlockRanges(markdown);
	if (blocks.some((card) => card.explicitCardId === newCardId)) {
		return { message: "That Card ID is already used in this Card Group.", status: "conflict" };
	}

	let updatedMarkdown: string;

	if (blocks.length > 0) {
		const target = blocks[input.cardBlockIndex];
		if (!target) {
			return { message: "Card block was not found.", status: "not_found" };
		}

		if (target.explicitCardId !== input.expectedCardId) {
			return { message: "Card ID changed after the repair view opened.", status: "conflict" };
		}
		if (target.invalidAttributes) {
			return { message: "Card start marker has ambiguous ID attributes.", status: "invalid" };
		}

		const opening = markdown.slice(target.markerStart, target.markerEnd);
		const marker = replaceOrInsertIdAttribute(opening, newCardId);
		updatedMarkdown = `${markdown.slice(0, target.markerStart)}${marker}${markdown.slice(target.markerEnd)}`;
	} else {
		if (input.cardBlockIndex !== 0 || input.expectedCardId) {
			return { message: "Card block was not found.", status: "not_found" };
		}

		const parsedCard = parsedBefore[0];
		if (!parsedCard?.isValid) {
			return { message: "Repair Card markers before assigning a stable ID.", status: "invalid" };
		}

		const markerSpan = getLegacyMarkerSpan(markdown);
		if (!markerSpan) {
			return { message: "Complete Card markers were not found.", status: "invalid" };
		}

		const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
		const start = `<!-- MNEME:CARD:start id="${newCardId}" -->${newline}`;
		const end = `${newline}<!-- MNEME:CARD:end -->`;
		updatedMarkdown = `${markdown.slice(0, markerSpan.start)}${start}${markdown.slice(markerSpan.start, markerSpan.end)}${end}${markdown.slice(markerSpan.end)}`;
	}

	const repairedCard = parseMnemeCards(updatedMarkdown)[input.cardBlockIndex];
	const repairedBlocks = getCardBlockRanges(updatedMarkdown);
	if (!repairedCard?.isValid || repairedCard.explicitCardId !== newCardId || repairedBlocks[input.cardBlockIndex]?.explicitCardId !== newCardId) {
		return { message: "Assigned Card ID did not pass marker validation.", status: "invalid" };
	}

	return { markdown: updatedMarkdown, status: "updated" };
}

function getCardBlockRanges(markdown: string): CardBlockRange[] {
	const pattern = /<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g;

	return Array.from(markdown.matchAll(pattern), (match) => {
		const markerStart = match.index ?? 0;
		const opening = (match[0] ?? "").match(/^<!--\s*MNEME:CARD:start\b[^>]*-->/)?.[0] ?? "";

		return {
			explicitCardId: parseCardIdAttribute(match[1] ?? ""),
			invalidAttributes: hasAmbiguousIdAttribute(match[1] ?? ""),
			markerEnd: markerStart + opening.length,
			markerStart,
		};
	});
}

function getLegacyMarkerSpan(markdown: string): { end: number; start: number } | undefined {
	const matches: Array<{ end: number; start: number }> = [];

	for (const section of ["FRONT", "BACK", "RUBRIC"]) {
		const pattern = new RegExp(`<!-- MNEME:${section}:start -->[\\s\\S]*?<!-- MNEME:${section}:end -->`, "g");
		matches.push(...Array.from(markdown.matchAll(pattern), (match) => ({
			end: (match.index ?? 0) + (match[0]?.length ?? 0),
			start: match.index ?? 0,
		})));
	}

	if (matches.length < 2) {
		return undefined;
	}

	return {
		end: Math.max(...matches.map((match) => match.end)),
		start: Math.min(...matches.map((match) => match.start)),
	};
}

function parseCardIdAttribute(attributes: string): string | undefined {
	return scanIdAttributes(attributes)[0]?.value;
}

function hasAmbiguousIdAttribute(attributes: string): boolean {
	return scanIdAttributes(attributes).length > 1;
}

function replaceOrInsertIdAttribute(marker: string, id: string): string {
	const openingEnd = marker.lastIndexOf("-->");
	const attributes = marker.slice(marker.indexOf("start") + "start".length, openingEnd);
	const idAttribute = scanIdAttributes(attributes)[0];
	if (idAttribute) {
		const value = idAttribute.quote ? `${idAttribute.quote}${id}${idAttribute.quote}` : id;
		const start = marker.indexOf("start") + "start".length + idAttribute.valueStart;
		return `${marker.slice(0, start)}${value}${marker.slice(start + idAttribute.rawValue.length)}`;
	}
	return `${marker.slice(0, openingEnd)} id="${id}"${marker.slice(openingEnd)}`;
}

interface IdAttribute { quote?: "'" | '"'; rawValue: string; value: string; valueStart: number; }

function scanIdAttributes(attributes: string): IdAttribute[] {
	const result: IdAttribute[] = [];
	let index = 0;
	while (index < attributes.length) {
		while (/\s/.test(attributes[index] ?? "")) index += 1;
		const nameStart = index;
		while (index < attributes.length && !/[\s=>]/.test(attributes[index] ?? "")) index += 1;
		if (index === nameStart) { index += 1; continue; }
		const name = attributes.slice(nameStart, index);
		while (/\s/.test(attributes[index] ?? "")) index += 1;
		if (attributes[index] !== "=") { continue; }
		index += 1;
		while (/\s/.test(attributes[index] ?? "")) index += 1;
		const quote = attributes[index] === '"' || attributes[index] === "'" ? attributes[index] as '"' | "'" : undefined;
		const valueStart = index;
		let value: string;
		if (quote) {
			index += 1;
			const innerStart = index;
			while (index < attributes.length && attributes[index] !== quote) index += 1;
			value = attributes.slice(innerStart, index);
			if (attributes[index] === quote) index += 1;
		} else {
			while (index < attributes.length && !/\s/.test(attributes[index] ?? "")) index += 1;
			value = attributes.slice(valueStart, index);
		}
		if (name === "id") result.push({ quote, rawValue: attributes.slice(valueStart, index), value: value.trim(), valueStart });
	}
	return result;
}
