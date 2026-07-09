import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { ParsedCardMarkers, parseMnemeCards } from "./cardMarkerParser";

const FALLBACK_ID_WARNING = "Card has no explicit id; using fallback identity.";

export class CardFileLoader {
	constructor(private readonly app: App) {
	}

	async loadCardFiles(): Promise<LoadedMnemeCard[]> {
		const cardFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => isCardFile(file, this.app.metadataCache.getFileCache(file)?.frontmatter));

		const loadedCardGroups = await Promise.all(cardFiles.map((file) => this.loadCardFile(file)));

		return markDuplicateCardIds(loadedCardGroups.flat());
	}

	private async loadCardFile(file: TFile): Promise<LoadedMnemeCard[]> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const parsedCards = parseMnemeCards(content);

			return parsedCards.map((parsed, index) => createLoadedCard(file, content, parsed, index));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error("Mneme: failed to load Card.md file", {
				error,
				path: file.path,
			});

			return [{
				back: "",
				basename: file.basename,
				cardId: `${file.path}#0`,
				cardIndex: 0,
				content: "",
				errors: [`Failed to load Card.md: ${message}`],
				front: "",
				hasExplicitCardId: false,
				id: `${file.path}#0`,
				isValid: false,
				path: file.path,
				warnings: [],
			}];
		}
	}
}

export function isCardFile(file: Pick<TFile, "name">, frontmatter?: unknown): boolean {
	return file.name === "Card.md" || isMnemeCardFrontmatter(frontmatter);
}

function isMnemeCardFrontmatter(frontmatter: unknown): boolean {
	return isRecord(frontmatter) && (frontmatter.mneme_type === "card" || frontmatter.mneme_type === "card_group");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createLoadedCard(
	file: TFile,
	content: string,
	parsed: ParsedCardMarkers,
	cardIndex: number,
): LoadedMnemeCard {
	return {
		back: parsed.back,
		basename: file.basename,
		cardId: getCardId(file.path, parsed, cardIndex),
		cardIndex,
		content,
		errors: parsed.errors.map((issue) => issue.message),
		front: parsed.front,
		hasExplicitCardId: parsed.hasExplicitCardId,
		id: getCardId(file.path, parsed, cardIndex),
		isValid: parsed.isValid,
		path: file.path,
		rubric: parsed.rubric || undefined,
		warnings: getWarningMessages(parsed),
	};
}

export function markDuplicateCardIds(cards: LoadedMnemeCard[]): LoadedMnemeCard[] {
	const counts = new Map<string, number>();

	for (const card of cards) {
		counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1);
	}

	return cards.map((card) => {
		if ((counts.get(card.cardId) ?? 0) < 2) {
			return card;
		}

		const duplicateError = `Duplicate card id: ${card.cardId}`;
		const errors = card.errors.includes(duplicateError)
			? card.errors
			: [...card.errors, duplicateError];

		return {
			...card,
			errors,
			isValid: false,
		};
	});
}

function getCardId(path: string, parsed: ParsedCardMarkers, cardIndex: number): string {
	return parsed.explicitCardId ?? `${path}#${cardIndex}`;
}

function getWarningMessages(parsed: ParsedCardMarkers): string[] {
	const warnings = parsed.warnings.map((issue) => issue.message);

	if (parsed.hasExplicitCardId || warnings.includes(FALLBACK_ID_WARNING)) {
		return warnings;
	}

	return [...warnings, FALLBACK_ID_WARNING];
}
