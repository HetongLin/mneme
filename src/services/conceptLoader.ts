import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { LoadedMnemeConcepts, MnemeConcept } from "../models/concept";
import { CardFileLoader } from "./cardFileLoader";

interface ConceptMetadata {
	sourcePath?: string;
	title?: string;
	warnings: string[];
}

export class ConceptLoader {
	private readonly cardFileLoader: CardFileLoader;

	constructor(private readonly app: App) {
		this.cardFileLoader = new CardFileLoader(app);
	}

	async loadConcepts(): Promise<LoadedMnemeConcepts> {
		const cards = await this.cardFileLoader.loadCardFiles();
		const groupedCards = groupCardsByFolder(cards);
		const concepts = await Promise.all(Array.from(groupedCards.entries())
			.map(([folderPath, conceptCards]) => this.createConcept(folderPath, conceptCards)));

		return {
			concepts,
			summary: {
				concepts: concepts.length,
				invalidCards: cards.filter((card) => !card.isValid).length,
				reviewableConcepts: concepts.filter((concept) => concept.isReviewable).length,
				scannedCards: cards.length,
				validCards: cards.filter((card) => card.isValid).length,
			},
		};
	}

	private async createConcept(folderPath: string, cards: LoadedMnemeCard[]): Promise<MnemeConcept> {
		const conceptPath = getConceptPath(folderPath);
		const conceptFile = this.getConceptFile(conceptPath);
		const metadata = conceptFile
			? await this.loadConceptMetadata(conceptFile)
			: { warnings: [] };
		const fallbackTitle = getFolderTitle(folderPath) || cards[0]?.path || "Card";
		const validCards = cards.filter((card) => card.isValid);

		return {
			cardPath: cards[0]?.path,
			cards,
			conceptPath: conceptFile?.path,
			errors: [],
			folderPath,
			id: folderPath || cards[0]?.path || fallbackTitle,
			isReviewable: validCards.length > 0,
			sourcePath: metadata.sourcePath,
			title: metadata.title || fallbackTitle,
			warnings: metadata.warnings,
		};
	}

	private getConceptFile(path: string): TFile | null {
		const abstractFile = this.app.vault.getAbstractFileByPath(path);

		if (abstractFile instanceof TFile) {
			return abstractFile;
		}

		return null;
	}

	private async loadConceptMetadata(file: TFile): Promise<ConceptMetadata> {
		try {
			const content = await this.app.vault.cachedRead(file);
			const frontmatter = parseSimpleFrontmatter(content);

			return {
				sourcePath: frontmatter.source,
				title: frontmatter.title || getFirstHeading(content),
				warnings: [],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			console.error("Mneme: failed to read Concept.md", {
				error,
				path: file.path,
			});

			return {
				warnings: [`Failed to read Concept.md: ${message}`],
			};
		}
	}
}

function groupCardsByFolder(cards: LoadedMnemeCard[]): Map<string, LoadedMnemeCard[]> {
	const groupedCards = new Map<string, LoadedMnemeCard[]>();

	for (const card of cards) {
		const folderPath = getFolderPath(card.path);
		const cardsInFolder = groupedCards.get(folderPath) ?? [];

		cardsInFolder.push(card);
		groupedCards.set(folderPath, cardsInFolder);
	}

	return groupedCards;
}

function getConceptPath(folderPath: string): string {
	if (folderPath.length === 0) {
		return "Concept.md";
	}

	return `${folderPath}/Concept.md`;
}

function getFolderPath(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");

	if (lastSlashIndex === -1) {
		return "";
	}

	return path.slice(0, lastSlashIndex);
}

function getFolderTitle(folderPath: string): string {
	const parts = folderPath.split("/").filter((part) => part.length > 0);

	return parts[parts.length - 1] ?? "";
}

function parseSimpleFrontmatter(content: string): Record<string, string> {
	if (!content.startsWith("---\n")) {
		return {};
	}

	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) {
		return {};
	}

	const frontmatter = content.slice(4, endIndex);
	const values: Record<string, string> = {};

	for (const line of frontmatter.split("\n")) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (key === "title" || key === "source") {
			values[key] = stripYamlQuotes(value);
		}
	}

	return values;
}

function getFirstHeading(content: string): string | undefined {
	for (const line of content.split("\n")) {
		const match = /^#\s+(.+)$/.exec(line.trim());

		if (match) {
			return match[1]?.trim();
		}
	}

	return undefined;
}

function stripYamlQuotes(value: string): string {
	if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}

	return value;
}
