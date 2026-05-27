import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { ParsedCardMarkers, parseMnemeCards } from "./cardMarkerParser";

export class CardFileLoader {
	constructor(private readonly app: App) {
	}

	async loadCardFiles(): Promise<LoadedMnemeCard[]> {
		const cardFiles = this.app.vault
			.getMarkdownFiles()
			.filter(isCardFile);

		const loadedCardGroups = await Promise.all(cardFiles.map((file) => this.loadCardFile(file)));

		return loadedCardGroups.flat();
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
				cardIndex: 0,
				content: "",
				errors: [`Failed to load Card.md: ${message}`],
				front: "",
				id: `${file.path}#0`,
				isValid: false,
				path: file.path,
				warnings: [],
			}];
		}
	}
}

export function isCardFile(file: Pick<TFile, "name">): boolean {
	return file.name === "Card.md";
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
		cardIndex,
		content,
		errors: parsed.errors.map((issue) => issue.message),
		front: parsed.front,
		id: `${file.path}#${cardIndex}`,
		isValid: parsed.isValid,
		path: file.path,
		rubric: parsed.rubric || undefined,
		warnings: parsed.warnings.map((issue) => issue.message),
	};
}
