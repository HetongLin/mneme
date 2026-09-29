import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import type { CardDraftType } from "../models/knowledgeProposal";
import { ParsedCardMarkers, parseMnemeCards } from "./cardMarkerParser";
import { isCardFile } from "./cardFileRecognition";
import { ObsidianVaultAdapter } from "./obsidianVaultAdapter";

export { isCardFile } from "./cardFileRecognition";

const FALLBACK_ID_WARNING = "Card has no explicit id; using fallback identity.";
const SCAN_BATCH_SIZE = 8;

export class CardFileLoader {
	private readonly vaultAdapter: ObsidianVaultAdapter;

	constructor(private readonly app: App) {
		this.vaultAdapter = new ObsidianVaultAdapter(app.vault);
	}

	async loadCardFiles(): Promise<LoadedMnemeCard[]> {
		// Cache misses and stale types cannot decide whether a custom-named file
		// contains Cards. Inspect current Markdown with bounded I/O instead.
		const files = this.app.vault.getMarkdownFiles();
		const loadedCardGroups: LoadedMnemeCard[][] = [];
		for (let index = 0; index < files.length; index += SCAN_BATCH_SIZE) {
			loadedCardGroups.push(...await Promise.all(files.slice(index, index + SCAN_BATCH_SIZE)
				.map((file) => this.loadCardFile(file))));
		}

		return markDuplicateCardIds(loadedCardGroups.flat());
	}

	private async loadCardFile(file: TFile): Promise<LoadedMnemeCard[]> {
		try {
			// Review can start immediately after Inbox appends a newly accepted Card.
			// cachedRead() may still expose the pre-write Card Group at that point, so
			// review scans must read the current vault contents directly.
			const content = await this.app.vault.read(file);
			let frontmatter: unknown;
			let metadataError: string | undefined;
			try {
				frontmatter = this.vaultAdapter.parseFrontmatter(content);
				if (frontmatter != null && !isRecord(frontmatter)) {
					throw new Error("Frontmatter must be a YAML mapping.");
				}
			} catch (error) {
				// A cached type may retain diagnostics for a broken known Card file,
				// but must never make stale Markdown eligible for review or export.
				if (!this.isKnownCardFile(file)) return [];
				metadataError = `Failed to read Card frontmatter: ${error instanceof Error ? error.message : String(error)}`;
			}
			if (!metadataError && !isCardFile(file, frontmatter)) return [];
			const parsedCards = parseMnemeCards(content);

			return parsedCards.map((parsed, index) => {
				const card = createLoadedCard(file, content, parsed, index, getLegacyCardType(frontmatter));
				return metadataError ? { ...card, isValid: false, errors: [...card.errors, metadataError] } : card;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!this.isKnownCardFile(file)) {
				console.warn("Mneme: could not inspect Markdown for Cards", { path: file.path, error });
				return [];
			}

			console.error("Mneme: failed to load Card Markdown file", {
				error,
				path: file.path,
			});

			return [{
				back: "",
				basename: file.basename,
				cardId: `${file.path}#0`,
				cardIndex: 0,
				content: "",
				errors: [`Failed to load Card Markdown: ${message}`],
				front: "",
				hasExplicitCardId: false,
				id: `${file.path}#0`,
				isValid: false,
				path: file.path,
				warnings: [],
			}];
		}
	}

	private isKnownCardFile(file: TFile): boolean {
		return isCardFile(file, this.app.metadataCache.getFileCache(file)?.frontmatter);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createLoadedCard(
	file: TFile,
	content: string,
	parsed: ParsedCardMarkers,
	cardIndex: number,
	legacyCardType?: CardDraftType,
): LoadedMnemeCard {
	return {
		back: parsed.back,
		basename: file.basename,
		cardId: getCardId(file.path, parsed, cardIndex),
		cardIndex,
		cardType: parsed.cardType ?? legacyCardType,
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

function getLegacyCardType(frontmatter: unknown): CardDraftType | undefined {
	if (!isRecord(frontmatter)) return undefined;
	const value = frontmatter.card_type;
	return value === "definition" || value === "distinction" || value === "procedure"
		|| value === "example" || value === "trap" || value === "proof"
		|| value === "application" || value === "mastery" || value === "other"
		? value
		: undefined;
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
