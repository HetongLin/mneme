import type { ConceptImportance, ConceptLearningMode, ConceptSummary } from "../models/conceptLibrary";
import type { ConceptSourceLink } from "../models/conceptSource";
import {
	getCardGroupLinkFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
	isMnemeConceptFrontmatter,
} from "./conceptMarkdownIdentity";
import {
	extractCoreMeaning,
	extractWhyItMatters,
	parseConceptTitle,
} from "./conceptMarkdownParser";

export interface ConceptVaultFile {
	mtime?: number;
	path: string;
}

export interface ConceptVaultAdapter {
	getFrontmatter(path: string): Promise<unknown | undefined>;
	listMarkdownFiles(): Promise<ConceptVaultFile[]>;
	readMarkdown(path: string): Promise<string>;
}

export interface ConceptSourceLinkReader {
	listByConceptId(conceptId: string): Promise<ConceptSourceLink[]>;
}

export interface ConceptScannerOptions {
	conceptSourceLinkStore?: ConceptSourceLinkReader;
	vault: ConceptVaultAdapter;
}

export class ConceptScanner {
	constructor(private readonly options: ConceptScannerOptions) {
	}

	async scanConcepts(): Promise<ConceptSummary[]> {
		const files = await this.options.vault.listMarkdownFiles();
		const concepts: ConceptSummary[] = [];

		for (const file of files) {
			const frontmatter = await this.options.vault.getFrontmatter(file.path);

			if (!isMnemeConceptFrontmatter(frontmatter)) {
				continue;
			}

			const conceptId = getConceptIdFromFrontmatter(frontmatter);

			if (!conceptId) {
				continue;
			}

			const markdown = await this.options.vault.readMarkdown(file.path);
			const sourceCount = await this.getSourceCount(conceptId);
			const summary: ConceptSummary = {
				cardsPath: parseCardsPath(getCardGroupLinkFromConceptFrontmatter(frontmatter)),
				conceptId,
				coreMeaning: extractCoreMeaning(markdown),
				importance: getImportance(frontmatter),
				learningMode: getLearningMode(frontmatter),
				path: file.path,
				sourceCount,
				title: parseConceptTitle(markdown, file.path),
				updatedAt: file.mtime,
				whyItMatters: extractWhyItMatters(markdown),
			};

			concepts.push(summary);
		}

		return concepts.sort(compareConceptSummariesByTitle);
	}

	private async getSourceCount(conceptId: string): Promise<number | undefined> {
		if (!this.options.conceptSourceLinkStore) {
			return undefined;
		}

		const links = await this.options.conceptSourceLinkStore.listByConceptId(conceptId);
		const approvedLinks = links.filter((link) => link.status === "approved");

		return approvedLinks.length;
	}
}

function getLearningMode(frontmatter: Record<string, unknown>): ConceptLearningMode | undefined {
	const value = frontmatter.learning_mode;

	return value === "reviewable" || value === "exploratory" ? value : undefined;
}

function getImportance(frontmatter: Record<string, unknown>): ConceptImportance | undefined {
	const value = frontmatter.importance;

	return value === "low" || value === "normal" || value === "high" || value === "critical"
		? value
		: undefined;
}

function parseCardsPath(cardsLink: string | undefined): string | undefined {
	if (!cardsLink) {
		return undefined;
	}

	const internalLinkMatch = cardsLink.match(/^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
	const rawPath = internalLinkMatch?.[1] ?? cardsLink;
	const path = rawPath.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");

	if (!path) {
		return undefined;
	}

	return /\.md$/i.test(path) ? path : `${path}.md`;
}

function compareConceptSummariesByTitle(first: ConceptSummary, second: ConceptSummary): number {
	return first.title.localeCompare(second.title, undefined, { sensitivity: "base" })
		|| first.path.localeCompare(second.path);
}
