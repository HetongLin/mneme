import { parseMnemeCards } from "./cardMarkerParser";

export type AppendCardGroupResult =
	| { markdown: string; status: "appended" | "unchanged" }
	| { message: string; status: "invalid" };

export function appendCardGroupDraft(existingMarkdown: string, draftMarkdown: string): AppendCardGroupResult {
	const existingConceptId = readFrontmatterScalar(existingMarkdown, "mneme_concept_id");
	const draftConceptId = readFrontmatterScalar(draftMarkdown, "mneme_concept_id");

	if (readFrontmatterScalar(existingMarkdown, "mneme_type") !== "card_group") {
		return { message: "The Card target is not a Mneme Card Group.", status: "invalid" };
	}
	if (!existingConceptId || !draftConceptId || existingConceptId !== draftConceptId) {
		return { message: "The Card Group belongs to a different Concept.", status: "invalid" };
	}

	const draftCards = parseMnemeCards(draftMarkdown);
	if (draftCards.length !== 1 || !draftCards[0]?.isValid || !draftCards[0].explicitCardId) {
		return { message: "The proposed Card block is invalid.", status: "invalid" };
	}

	const draftCard = draftCards[0];
	const existingCards = parseMnemeCards(existingMarkdown);
	if (existingCards.some((card) => !card.isValid || !card.explicitCardId)) {
		return { message: "Repair invalid or unidentified Cards before appending to this Card Group.", status: "invalid" };
	}
	const existingIds = existingCards.map((card) => card.explicitCardId as string);
	if (new Set(existingIds).size !== existingIds.length) {
		return { message: "Repair duplicate Card IDs before appending to this Card Group.", status: "invalid" };
	}
	const existingMatch = existingCards.find((card) => card.explicitCardId === draftCard.explicitCardId);
	if (existingMatch) {
		return existingMatch.front === draftCard.front
			&& existingMatch.back === draftCard.back
			&& existingMatch.rubric === draftCard.rubric
			&& existingMatch.cardType === draftCard.cardType
			? { markdown: existingMarkdown, status: "unchanged" }
			: { message: `Card ID already exists with different content: ${draftCard.explicitCardId}`, status: "invalid" };
	}

	const rawBlock = extractSingleCardBlock(draftMarkdown);
	if (!rawBlock) {
		return { message: "The proposed Card wrapper is invalid.", status: "invalid" };
	}

	return {
		markdown: `${existingMarkdown.trimEnd()}\n\n${rawBlock.trim()}\n`,
		status: "appended",
	};
}

function extractSingleCardBlock(markdown: string): string | undefined {
	const blocks = Array.from(markdown.matchAll(
		/<!--\s*MNEME:CARD:start\b([^>]*)-->([\s\S]*?)<!--\s*MNEME:CARD:end\s*-->/g,
	));

	return blocks.length === 1 ? blocks[0]?.[0] : undefined;
}

function readFrontmatterScalar(markdown: string, key: string): string | undefined {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1];
	if (!frontmatter) {
		return undefined;
	}

	const pattern = new RegExp(`^${key}\\s*:\\s*([^#\\r\\n]*?)(?:\\s+#.*)?$`, "m");
	const value = pattern.exec(frontmatter)?.[1]?.trim().replace(/^['"]|['"]$/g, "");

	return value || undefined;
}
