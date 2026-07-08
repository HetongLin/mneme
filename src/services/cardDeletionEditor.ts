import { parseMnemeCards } from "./cardMarkerParser";

export interface DeleteCardBlockInput {
	cardId: string;
	expectedBack: string;
	expectedFront: string;
}

export type DeleteCardBlockResult =
	| { markdown: string; status: "deleted" }
	| { message: string; status: "conflict" | "invalid" | "not_found" };

interface CardBlockRange {
	cardId?: string;
	end: number;
	start: number;
}

export function deleteCardBlock(markdown: string, input: DeleteCardBlockInput): DeleteCardBlockResult {
	const cardId = input.cardId.trim();
	if (!cardId) {
		return { message: "A stable Card ID is required.", status: "invalid" };
	}

	const parsedMatches = parseMnemeCards(markdown).filter((card) => card.explicitCardId === cardId);
	const rangeMatches = getCardBlockRanges(markdown).filter((block) => block.cardId === cardId);
	if (parsedMatches.length === 0 || rangeMatches.length === 0) {
		return { message: "Card block was not found.", status: "not_found" };
	}
	if (parsedMatches.length !== 1 || rangeMatches.length !== 1) {
		return { message: "Duplicate Card IDs must be repaired before deletion.", status: "invalid" };
	}

	const parsed = parsedMatches[0];
	if (!parsed?.isValid) {
		return { message: "Invalid Card markers must be repaired before deletion.", status: "invalid" };
	}
	if (parsed.front !== input.expectedFront || parsed.back !== input.expectedBack) {
		return { message: "Card content changed after the delete view opened.", status: "conflict" };
	}

	const range = rangeMatches[0];
	if (!range) {
		return { message: "Card block was not found.", status: "not_found" };
	}
	const updated = `${markdown.slice(0, range.start)}${markdown.slice(range.end)}`;
	if (parseMnemeCards(updated).some((card) => card.explicitCardId === cardId)) {
		return { message: "Deleted Card ID is still present after the edit.", status: "invalid" };
	}

	return { markdown: updated, status: "deleted" };
}

function getCardBlockRanges(markdown: string): CardBlockRange[] {
	const pattern = /<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g;

	return Array.from(markdown.matchAll(pattern), (match) => ({
		cardId: parseCardIdAttribute(match[1] ?? ""),
		end: (match.index ?? 0) + (match[0]?.length ?? 0),
		start: match.index ?? 0,
	}));
}

function parseCardIdAttribute(attributes: string): string | undefined {
	const quoted = /\bid\s*=\s*"([^"]+)"/.exec(attributes)
		?? /\bid\s*=\s*'([^']+)'/.exec(attributes);
	const value = quoted?.[1] ?? /\bid\s*=\s*([^\s>]+)/.exec(attributes)?.[1];

	return value?.trim() || undefined;
}
