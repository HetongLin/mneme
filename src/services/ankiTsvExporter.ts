import type { LoadedMnemeCard } from "../models/card";

export interface AnkiTsvExportOptions {
	retiredCardIds?: Set<string>;
}

export interface AnkiTsvExportResult {
	exportedCardCount: number;
	skippedCardCount: number;
	tsv: string;
}

export function exportCardsToAnkiTsv(
	cards: LoadedMnemeCard[],
	options: AnkiTsvExportOptions = {},
): AnkiTsvExportResult {
	const retiredCardIds = options.retiredCardIds ?? new Set<string>();
	const rows: string[] = [];
	let skippedCardCount = 0;

	for (const card of cards) {
		if (!isAnkiExportableCard(card, retiredCardIds)) {
			skippedCardCount += 1;
			continue;
		}

		rows.push([
			toAnkiHtml(card.front),
			renderBackField(card),
			renderTagsField(card),
		].join("\t"));
	}

	return {
		exportedCardCount: rows.length,
		skippedCardCount,
		tsv: rows.join("\n"),
	};
}

function isAnkiExportableCard(card: LoadedMnemeCard, retiredCardIds: Set<string>): boolean {
	return card.isValid
		&& card.hasExplicitCardId
		&& card.front.trim().length > 0
		&& card.back.trim().length > 0
		&& !retiredCardIds.has(card.cardId);
}

function renderBackField(card: LoadedMnemeCard): string {
	const parts = [
		toAnkiHtml(card.back),
		`<!-- mneme_card_id: ${sanitizeHtmlComment(card.cardId)} -->`,
	];

	if (card.rubric?.trim()) {
		parts.splice(1, 0, `<hr><strong>Rubric</strong><br>${toAnkiHtml(card.rubric)}`);
	}

	return parts.join("<br>");
}

function renderTagsField(card: LoadedMnemeCard): string {
	return [
		"mneme",
		`mneme_card_${sanitizeTag(card.cardId)}`,
	].join(" ");
}

function toAnkiHtml(value: string): string {
	return value
		.trim()
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\t/g, " ")
		.replace(/\r?\n/g, "<br>");
}

function sanitizeHtmlComment(value: string): string {
	return value.replace(/--/g, "—");
}

function sanitizeTag(value: string): string {
	const sanitized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_")
		.replace(/^_+|_+$/g, "");

	return sanitized || "card";
}
