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
	const expectedCard = parsedBefore[input.cardBlockIndex];
	if (
		!expectedCard
		|| (input.expectedFront !== undefined && expectedCard.front !== input.expectedFront)
		|| (input.expectedBack !== undefined && expectedCard.back !== input.expectedBack)
	) {
		return { message: "Card content changed after the repair view opened.", status: "conflict" };
	}

	if (parsedBefore.some((card) => card.explicitCardId === newCardId)) {
		return { message: "That Card ID is already used in this Card Group.", status: "conflict" };
	}

	const blocks = getCardBlockRanges(markdown);
	let updatedMarkdown: string;

	if (blocks.length > 0) {
		const target = blocks[input.cardBlockIndex];
		if (!target) {
			return { message: "Card block was not found.", status: "not_found" };
		}

		if (target.explicitCardId !== input.expectedCardId) {
			return { message: "Card ID changed after the repair view opened.", status: "conflict" };
		}

		const marker = `<!-- MNEME:CARD:start id="${newCardId}" -->`;
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

		const start = `<!-- MNEME:CARD:start id="${newCardId}" -->\n`;
		const end = "\n<!-- MNEME:CARD:end -->";
		updatedMarkdown = `${markdown.slice(0, markerSpan.start)}${start}${markdown.slice(markerSpan.start, markerSpan.end)}${end}${markdown.slice(markerSpan.end)}`;
	}

	const repairedCard = parseMnemeCards(updatedMarkdown)[input.cardBlockIndex];
	if (!repairedCard?.isValid || repairedCard.explicitCardId !== newCardId) {
		return { message: "Assigned Card ID did not pass marker validation.", status: "invalid" };
	}

	return { markdown: updatedMarkdown, status: "updated" };
}

function getCardBlockRanges(markdown: string): CardBlockRange[] {
	const pattern = /<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g;

	return Array.from(markdown.matchAll(pattern), (match) => {
		const fullMatch = match[0] ?? "";
		const content = match[2] ?? "";
		const markerStart = match.index ?? 0;
		const contentOffset = fullMatch.indexOf(content);

		return {
			explicitCardId: parseCardIdAttribute(match[1] ?? ""),
			markerEnd: markerStart + contentOffset,
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
	const quoted = /\bid\s*=\s*"([^"]+)"/.exec(attributes)
		?? /\bid\s*=\s*'([^']+)'/.exec(attributes);
	const value = quoted?.[1] ?? /\bid\s*=\s*([^\s>]+)/.exec(attributes)?.[1];

	return value?.trim() || undefined;
}
