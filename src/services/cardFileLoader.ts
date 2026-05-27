import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { parseCardMarkers } from "./cardMarkerParser";

export class CardFileLoader {
	constructor(private readonly app: App) {
	}

	async loadCardFiles(): Promise<LoadedMnemeCard[]> {
		const cardFiles = this.app.vault
			.getMarkdownFiles()
			.filter(isCardFile);

		return Promise.all(cardFiles.map((file) => this.loadCardFile(file)));
	}

	private async loadCardFile(file: TFile): Promise<LoadedMnemeCard> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const parsed = parseCardMarkers(content);

			return {
				back: parsed.back,
				basename: file.basename,
				content,
				errors: parsed.errors.map((issue) => issue.message),
				front: parsed.front,
				isValid: parsed.isValid,
				path: file.path,
				rubric: parsed.rubric || undefined,
				warnings: parsed.warnings.map((issue) => issue.message),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error("Mneme: failed to load Card.md file", {
				error,
				path: file.path,
			});

			return {
				back: "",
				basename: file.basename,
				content: "",
				errors: [`Failed to load Card.md: ${message}`],
				front: "",
				isValid: false,
				path: file.path,
				warnings: [],
			};
		}
	}
}

export function isCardFile(file: Pick<TFile, "name">): boolean {
	return file.name === "Card.md";
}
