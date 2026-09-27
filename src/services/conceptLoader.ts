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
	isCardGroup?: boolean;
}

interface ConceptCardGroup {
	cards: LoadedMnemeCard[];
	conceptFile: TFile | null;
	folderPath: string;
	hasConceptLink: boolean;
	id: string;
}

export class ConceptLoader {
	private readonly cardFileLoader: CardFileLoader;

	constructor(private readonly app: App) {
		this.cardFileLoader = new CardFileLoader(app);
	}

	async loadConcepts(): Promise<LoadedMnemeConcepts> {
		const cards = await this.cardFileLoader.loadCardFiles();
		const groupedCards = this.groupCardsByOwner(cards);
		const concepts = await Promise.all(groupedCards.map((group) => this.createConcept(group)));

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

	private groupCardsByOwner(cards: LoadedMnemeCard[]): ConceptCardGroup[] {
		const groups = new Map<string, ConceptCardGroup>();
		const groupsByFile = new Map<string, ConceptCardGroup>();
		for (const card of cards) {
			const existingFileGroup = groupsByFile.get(card.path);
			if (existingFileGroup) {
				existingFileGroup.cards.push(card);
				continue;
			}

			const folderPath = getFolderPath(card.path);
			const metadata = this.getCardGroupMetadata(card);
			const hasOwner = !!(metadata.conceptId || metadata.conceptPath);
			const isLegacyFolder = !hasOwner && !metadata.isCardGroup;
			const conceptFile = metadata.conceptPath
				? this.resolveMarkdownFile(metadata.conceptPath, card.path)
				: this.getConceptFile(getConceptPath(folderPath));
			// Keep stable owners separate even in a shared folder. A link is the
			// grouping fallback only when a stable owner ID is unavailable.
			const key = JSON.stringify(metadata.conceptId
				? ["owner", folderPath, metadata.conceptId]
				: metadata.conceptPath
					? ["link", folderPath, conceptFile?.path ?? metadata.conceptPath]
					: [isLegacyFolder ? "folder" : "file", isLegacyFolder ? folderPath : card.path]);
			let group = groups.get(key);
			if (!group) {
				group = {
					cards: [], conceptFile, folderPath, hasConceptLink: !!metadata.conceptPath,
					id: metadata.conceptId ?? (isLegacyFolder ? folderPath || card.path : card.path),
				};
				groups.set(key, group);
			} else if (metadata.conceptPath && (!group.hasConceptLink || (!group.conceptFile && conceptFile))) {
				// Prefer a resolving explicit link when legacy declarations are
				// partial or stale, independent of file enumeration order.
				group.conceptFile = conceptFile;
				group.hasConceptLink = true;
			}
			group.cards.push(card);
			groupsByFile.set(card.path, group);
		}
		return [...groups.values()];
	}

	private async createConcept({ folderPath, cards, conceptFile, id }: ConceptCardGroup): Promise<MnemeConcept> {
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
			id,
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
			isCardGroup: frontmatter?.mneme_type === "card_group",
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
