import { parseMnemeCards } from "./cardMarkerParser";

export interface CardMarkerUpdateInput {
	back: string;
	cardBlockIndex: number;
	explicitCardId?: string;
	front: string;
	rubric: string;
}

export type CardMarkerUpdateResult =
	| { markdown: string; status: "updated" }
	| { message: string; status: "invalid" | "not_found" };

interface CardBlockRange {
	contentEnd: number;
	contentStart: number;
	explicitCardId?: string;
	index: number;
}

export function updateCardMarkers(markdown: string, input: CardMarkerUpdateInput): CardMarkerUpdateResult {
	const front = input.front.trim();
	const back = input.back.trim();
	const rubric = input.rubric.trim();

	if (!front || !back) {
		return { message: "Front and Back are required.", status: "invalid" };
	}

	const blocks = getCardBlockRanges(markdown);
	let updatedMarkdown: string;

	if (blocks.length === 0) {
		if (input.cardBlockIndex !== 0 || input.explicitCardId) {
			return { message: "Card markers were not found.", status: "not_found" };
		}

		const updated = updateCardBlock(markdown, front, back, rubric);
		if (!updated) {
			return { message: "Card marker structure is invalid.", status: "invalid" };
		}
		updatedMarkdown = updated;
	} else {
		const target = input.explicitCardId
			? blocks.find((block) => block.explicitCardId === input.explicitCardId)
			: blocks[input.cardBlockIndex];

		if (!target) {
			return { message: "Card markers were not found.", status: "not_found" };
		}

		const content = markdown.slice(target.contentStart, target.contentEnd);
		const updated = updateCardBlock(content, front, back, rubric);
		if (!updated) {
			return { message: "Card marker structure is invalid.", status: "invalid" };
		}

		updatedMarkdown = `${markdown.slice(0, target.contentStart)}${updated}${markdown.slice(target.contentEnd)}`;
	}

	const parsedCards = parseMnemeCards(updatedMarkdown);
	const updatedCard = input.explicitCardId
		? parsedCards.find((card) => card.explicitCardId === input.explicitCardId)
		: parsedCards[input.cardBlockIndex];

	if (
		!updatedCard?.isValid
		|| updatedCard.front !== front
		|| updatedCard.back !== back
		|| updatedCard.rubric !== rubric
	) {
		return { message: "Edited Card did not pass marker validation.", status: "invalid" };
	}

	return { markdown: updatedMarkdown, status: "updated" };
}

function updateCardBlock(markdown: string, front: string, back: string, rubric: string): string | undefined {
	const withFront = replaceSection(markdown, "FRONT", front);
	const withBack = withFront ? replaceSection(withFront, "BACK", back) : undefined;

	if (!withBack) {
		return undefined;
	}

	const withRubric = replaceSection(withBack, "RUBRIC", rubric);

	return withRubric ?? insertRubricAfterBack(withBack, rubric);
}

function replaceSection(markdown: string, section: "FRONT" | "BACK" | "RUBRIC", value: string): string | undefined {
	const start = `<!-- MNEME:${section}:start -->`;
	const end = `<!-- MNEME:${section}:end -->`;
	const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);

	if (!pattern.test(markdown)) {
		return undefined;
	}

	return markdown.replace(pattern, `${start}\n${value}\n${end}`);
}

function insertRubricAfterBack(markdown: string, rubric: string): string | undefined {
	const backEnd = "<!-- MNEME:BACK:end -->";
	const index = markdown.indexOf(backEnd);

	if (index < 0) {
		return undefined;
	}

	const insertAt = index + backEnd.length;
	const section = [
		"",
		"<!-- MNEME:RUBRIC:start -->",
		rubric,
		"<!-- MNEME:RUBRIC:end -->",
	].join("\n");

	return `${markdown.slice(0, insertAt)}${section}${markdown.slice(insertAt)}`;
}

function getCardBlockRanges(markdown: string): CardBlockRange[] {
	const pattern = /<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g;

	return Array.from(markdown.matchAll(pattern), (match, index) => {
		const fullMatch = match[0] ?? "";
		const content = match[2] ?? "";
		const matchStart = match.index ?? 0;
		const contentOffset = fullMatch.indexOf(content);

		return {
			contentEnd: matchStart + contentOffset + content.length,
			contentStart: matchStart + contentOffset,
			explicitCardId: parseCardIdAttribute(match[1] ?? ""),
			index,
		};
	});
}

function parseCardIdAttribute(attributes: string): string | undefined {
	const quoted = /\bid\s*=\s*"([^"]+)"/.exec(attributes)
		?? /\bid\s*=\s*'([^']+)'/.exec(attributes);
	const value = quoted?.[1] ?? /\bid\s*=\s*([^\s>]+)/.exec(attributes)?.[1];

	return value?.trim() || undefined;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
