import { App, TFile } from "obsidian";
import { LoadedMnemeCard } from "../models/card";
import { LoadedMnemeConcepts, MnemeConcept } from "../models/concept";
import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import { CardFileLoader } from "./cardFileLoader";
import { readConceptEditableMetadata } from "./conceptMetadataUpdater";
import {
	getCardGroupConceptIdFromFrontmatter,
	getConceptLinkFromCardGroupFrontmatter,
	getConceptIdFromFrontmatter,
	isMnemeCardGroupFrontmatter,
} from "./conceptMarkdownIdentity";
import { ObsidianVaultAdapter } from "./obsidianVaultAdapter";
import { extractFirstConceptSourcePath, parseObsidianLinkPath } from "./reviewNavigation";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";

interface ConceptMetadata {
	conceptId?: string;
	readError?: string;
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
	errors?: string[];
}

interface ConceptCardGroup {
	cards: LoadedMnemeCard[];
	explicitFiles: Map<string, TFile>;
	fallbackFiles: Map<string, TFile>;
	errors: string[];
	folderPath: string;
	hasConceptLink: boolean;
	id: string;
	ownerId?: string;
}

export class ConceptLoader {
	private readonly cardFileLoader: CardFileLoader;
	private readonly vaultAdapter: ObsidianVaultAdapter;

	constructor(private readonly app: App) {
		this.cardFileLoader = new CardFileLoader(app);
		this.vaultAdapter = new ObsidianVaultAdapter(app.vault);
	}

	async loadConcepts(): Promise<LoadedMnemeConcepts> {
		const cards = await this.cardFileLoader.loadCardFiles();
		const groupedCards = this.groupCardsByOwner(cards);
		const concepts = await Promise.all(groupedCards.map((group) => this.createConcept(group)));
		const evaluatedCards = concepts.flatMap((concept) => concept.cards);

		return {
			concepts,
			summary: {
				concepts: concepts.length,
				invalidCards: evaluatedCards.filter((card) => !card.isValid).length,
				reviewableConcepts: concepts.filter((concept) => concept.isReviewable).length,
				scannedCards: cards.length,
				validCards: evaluatedCards.filter((card) => card.isValid).length,
			},
		};
	}

	private groupCardsByOwner(cards: LoadedMnemeCard[]): ConceptCardGroup[] {
		const groups = new Map<string, ConceptCardGroup>();
		const groupsByFile = new Map<string, ConceptCardGroup>();
		for (const card of [...cards].sort((a, b) => a.path.localeCompare(b.path))) {
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
			// A stable owner has one review entry across the Vault. A link is the
			// grouping fallback only when a stable owner ID is unavailable.
			const key = JSON.stringify(metadata.conceptId
				? ["owner", metadata.conceptId]
				: metadata.conceptPath
					? ["link", folderPath, conceptFile?.path ?? metadata.conceptPath]
					: [isLegacyFolder ? "folder" : "file", isLegacyFolder ? folderPath : card.path]);
			let group = groups.get(key);
			if (!group) {
				group = {
					cards: [], explicitFiles: new Map(), fallbackFiles: new Map(), errors: [],
					folderPath, hasConceptLink: false, ownerId: metadata.conceptId,
					id: metadata.conceptId ?? (isLegacyFolder ? folderPath || card.path : card.path),
				};
				groups.set(key, group);
			}
			group.hasConceptLink ||= !!metadata.conceptPath;
			if (conceptFile) {
				(metadata.conceptPath ? group.explicitFiles : group.fallbackFiles).set(conceptFile.path, conceptFile);
			}
			group.errors.push(...metadata.errors ?? []);
			group.cards.push(card);
			groupsByFile.set(card.path, group);
		}
		return [...groups.values()];
	}

	private async createConcept(group: ConceptCardGroup): Promise<MnemeConcept> {
		const { folderPath, id, ownerId } = group;
		// A resolving explicit link wins over conventional folder metadata, but
		// conflicting resolved destinations must never be settled by scan order.
		const candidates = group.explicitFiles.size > 0 || group.hasConceptLink
			? group.explicitFiles : group.fallbackFiles;
		const errors = [...group.errors];
		if (candidates.size > 1) {
			errors.push(`Conflicting Concept paths for owner ${id}: ${[...candidates.keys()].sort().join(", ")}. Check the Card files' concept links before reviewing.`);
		}
		const conceptFile = candidates.size === 1 ? [...candidates.values()][0] : undefined;
		const metadata = conceptFile
			? await this.loadConceptMetadata(conceptFile)
			: { warnings: [] };
		if (metadata.readError) errors.push(`Cannot verify Concept ownership at ${conceptFile?.path}: ${metadata.readError}`);
		if (ownerId && metadata.conceptId && ownerId !== metadata.conceptId) {
			errors.push(`Card owner ${ownerId} conflicts with Concept ID ${metadata.conceptId} at ${conceptFile?.path}. Check mneme_concept_id and the concept link before reviewing.`);
		}
		const cards = errors.length > 0
			? group.cards.map((card) => ({ ...card, isValid: false, errors: [...card.errors, ...errors] }))
			: group.cards;
		const fallbackTitle = getFolderTitle(folderPath) || cards[0]?.path || "Card";
		const validCards = cards.filter((card) => card.isValid);

		return {
			cardPath: cards[0]?.path,
			cards,
			conceptPath: errors.length === 0 ? conceptFile?.path : undefined,
			errors,
			folderPath,
			id,
			importance: errors.length === 0 ? metadata.importance : undefined,
			isReviewable: validCards.length > 0 && metadata.learningMode !== "exploratory",
			learningMode: errors.length === 0 ? metadata.learningMode : undefined,
			retentionTarget: errors.length === 0 ? metadata.retentionTarget : undefined,
			sourcePath: errors.length === 0 ? metadata.sourcePath : undefined,
			title: (errors.length === 0 ? metadata.title : undefined) || fallbackTitle,
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

		let frontmatter: unknown;
		try {
			frontmatter = this.vaultAdapter.parseFrontmatter(card.content);
			assertFrontmatterMapping(frontmatter);
		} catch (error) {
			return { isCardGroup: true, errors: [`Cannot read Card ownership in ${card.path}: ${error instanceof Error ? error.message : String(error)}`] };
		}
		const conceptLink = getConceptLinkFromCardGroupFrontmatter(frontmatter);

		return {
			conceptId: getCardGroupConceptIdFromFrontmatter(frontmatter),
			conceptPath: conceptLink ? parseObsidianLinkPath(conceptLink) : undefined,
			isCardGroup: isMnemeCardGroupFrontmatter(frontmatter) && frontmatter.mneme_type === "card_group",
		};
	}

	private resolveMarkdownFile(linkPath: string, sourcePath: string): TFile | null {
		if (!linkPath.includes("/")) {
			return this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
		}
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
			const content = await this.app.vault.read(file);
			const identity = this.vaultAdapter.parseFrontmatter(content);
			assertFrontmatterMapping(identity);
			const frontmatter = parseSimpleFrontmatter(content.replace(/\r\n/g, "\n"));
			const editableMetadata = readConceptEditableMetadata(content);

			return {
				conceptId: getConceptIdFromFrontmatter(identity),
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
				readError: message,
				warnings: [`Failed to read Concept.md: ${message}`],
			};
		}
	}
}

function assertFrontmatterMapping(value: unknown): void {
	if (value !== null && value !== undefined && (typeof value !== "object" || Array.isArray(value))) {
		throw new Error("Frontmatter must be a YAML mapping.");
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
