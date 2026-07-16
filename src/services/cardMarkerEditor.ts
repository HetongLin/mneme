import { parseMnemeCards } from "./cardMarkerParser";

export interface CardMarkerUpdateInput {
	back: string;
	cardBlockIndex: number;
	expectedBack?: string;
	expectedFront?: string;
	expectedRubric?: string;
	explicitCardId?: string;
	front: string;
	rubric: string;
}

export type CardMarkerUpdateResult =
	| { markdown: string; status: "updated" }
	| { message: string; status: "conflict" | "invalid" | "not_found" };

interface CardBlockRange {
	contentEnd: number;
	contentStart: number;
	explicitCardId?: string;
	index: number;
}

export function updateCardMarkers(markdown: string, input: CardMarkerUpdateInput): CardMarkerUpdateResult {
	return writeCardMarkers(markdown, input, updateCardBlock);
}

export function repairCardMarkers(markdown: string, input: CardMarkerUpdateInput): CardMarkerUpdateResult {
	return writeCardMarkers(markdown, input, repairCardBlock);
}

function writeCardMarkers(
	markdown: string,
	input: CardMarkerUpdateInput,
	writeBlock: (markdown: string, front: string, back: string, rubric: string) => string | undefined,
): CardMarkerUpdateResult {
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

		const currentCard = parseMnemeCards(markdown)[0];
		if (hasTargetedEditConflict(currentCard, input)) {
			return createEditConflictResult();
		}

		const updated = writeBlock(markdown, front, back, rubric);
		if (!updated) {
			return { message: "Card marker structure is invalid.", status: "invalid" };
		}
		updatedMarkdown = updated;
	} else {
		const matchingIdBlocks = input.explicitCardId
			? blocks.filter((block) => block.explicitCardId === input.explicitCardId)
			: [];
		if (matchingIdBlocks.length > 1) {
			return {
				message: "Card ID is duplicated. Repair the Card ID before editing content.",
				status: "conflict",
			};
		}
		const target = input.explicitCardId
			? matchingIdBlocks[0]
			: blocks[input.cardBlockIndex];

		if (!target) {
			return { message: "Card markers were not found.", status: "not_found" };
		}

		const content = markdown.slice(target.contentStart, target.contentEnd);
		const currentCard = parseMnemeCards(content)[0];
		if (hasTargetedEditConflict(currentCard, input)) {
			return createEditConflictResult();
		}
		const updated = writeBlock(content, front, back, rubric);
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

function hasTargetedEditConflict(
	currentCard: ReturnType<typeof parseMnemeCards>[number] | undefined,
	input: CardMarkerUpdateInput,
): boolean {
	if (!currentCard) return true;

	return (input.expectedFront !== undefined && currentCard.front !== input.expectedFront.trim())
		|| (input.expectedBack !== undefined && currentCard.back !== input.expectedBack.trim())
		|| (input.expectedRubric !== undefined && currentCard.rubric !== input.expectedRubric.trim());
}

function createEditConflictResult(): CardMarkerUpdateResult {
	return {
		message: "Card changed while the editor was open. Reopen it to review the latest content.",
		status: "conflict",
	};
}

function repairCardBlock(markdown: string, front: string, back: string, rubric: string): string | undefined {
	let repaired = markdown;

	for (const [section, value] of [
		["FRONT", front],
		["BACK", back],
		["RUBRIC", rubric],
	] as const) {
		const start = `<!-- MNEME:${section}:start -->`;
		const end = `<!-- MNEME:${section}:end -->`;
		const startCount = countOccurrences(repaired, start);
		const endCount = countOccurrences(repaired, end);

		if (startCount === 1 && endCount === 1) {
			const replaced = replaceSection(repaired, section, value);
			if (!replaced) {
				return undefined;
			}
			repaired = replaced;
			continue;
		}

		if (startCount !== 0 || endCount !== 0) {
			return undefined;
		}

		repaired = appendSection(repaired, section, value);
	}

	return repaired;
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

function appendSection(markdown: string, section: "FRONT" | "BACK" | "RUBRIC", value: string): string {
	const prefix = markdown.length > 0 && !markdown.endsWith("\n") ? "\n" : "";
	const block = [
		`<!-- MNEME:${section}:start -->`,
		value,
		`<!-- MNEME:${section}:end -->`,
	].join("\n");

	return `${markdown}${prefix}${block}\n`;
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

function countOccurrences(markdown: string, needle: string): number {
	return markdown.split(needle).length - 1;
}
