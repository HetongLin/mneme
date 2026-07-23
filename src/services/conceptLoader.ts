import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { LoadedMnemeConcepts, MnemeConcept } from "../models/concept";
import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import { CardFileLoader } from "./cardFileLoader";
import { readConceptEditableMetadata } from "./conceptMetadataUpdater";
import {
	getCardGroupConceptIdFromFrontmatter,
	getConceptLinkFromCardGroupFrontmatter,
} from "./conceptMarkdownIdentity";
import { extractFirstConceptSourcePath, parseObsidianLinkPath } from "./reviewNavigation";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";

interface ConceptMetadata {
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	retentionTarget?: number;
	sourcePath?: string;
	title?: string;
	warnings: string[];
}

interface CardGroupMetadata {
	conceptId?: string;
	conceptPath?: string;
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
		const cardGroupMetadata = this.getCardGroupMetadata(cards[0]);
		const legacyConceptPath = getConceptPath(folderPath);
		const conceptFile = cardGroupMetadata.conceptPath
			? this.resolveMarkdownFile(cardGroupMetadata.conceptPath, cards[0]?.path ?? "")
			: this.getConceptFile(legacyConceptPath);
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
			id: cardGroupMetadata.conceptId ?? (folderPath || cards[0]?.path || fallbackTitle),
			importance: metadata.importance,
			isReviewable: validCards.length > 0 && metadata.learningMode !== "exploratory",
			learningMode: metadata.learningMode,
			retentionTarget: metadata.retentionTarget,
			sourcePath: metadata.sourcePath,
			title: metadata.title || fallbackTitle,
			warnings: metadata.warnings,
		};
	}

	private getCardGroupMetadata(card: LoadedMnemeCard | undefined): CardGroupMetadata {
		if (!card) {
			return {};
		}

		const file = this.app.vault.getAbstractFileByPath(card.path);

		if (!(file instanceof TFile)) {
			return {};
		}

		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter
			?? parseSimpleFrontmatter(card.content);
		const conceptLink = getConceptLinkFromCardGroupFrontmatter(frontmatter);

		return {
			conceptId: getCardGroupConceptIdFromFrontmatter(frontmatter),
			conceptPath: conceptLink ? parseObsidianLinkPath(conceptLink) : undefined,
		};
	}

	private resolveMarkdownFile(linkPath: string, sourcePath: string): TFile | null {
		const direct = this.app.vault.getAbstractFileByPath(linkPath);

		if (direct instanceof TFile) {
			return direct;
		}

		const withExtension = this.app.vault.getAbstractFileByPath(
			/\.md$/i.test(linkPath) ? linkPath : `${linkPath}.md`,
		);

		return withExtension instanceof TFile
			? withExtension
			: this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
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
			const editableMetadata = readConceptEditableMetadata(content);

			return {
				importance: editableMetadata.importance,
				learningMode: editableMetadata.learningMode,
				retentionTarget: editableMetadata.retentionTarget,
				sourcePath: frontmatter.source ?? extractFirstConceptSourcePath(content),
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

function getFirstHeading(content: string): string | undefined {
	for (const line of content.split("\n")) {
		const match = /^#\s+(.+)$/.exec(line.trim());

		if (match) {
			return match[1]?.trim();
		}
	}

	return undefined;
}
