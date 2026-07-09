import type {
	ConceptIdentityIssue,
	ConceptImportance,
	ConceptLearningMode,
	ConceptScanResult,
	ConceptStaleSourceIssue,
	ConceptSummary,
} from "../models/conceptLibrary";
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
import { detectConceptDuplicates } from "./conceptDuplicateDetector";

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
		return (await this.scan()).concepts;
	}

	async scan(): Promise<ConceptScanResult> {
		const files = await this.options.vault.listMarkdownFiles();
		const candidates: Array<{
			cardsPath?: string;
			conceptId?: string;
			file: ConceptVaultFile;
			frontmatter: Record<string, unknown>;
			markdown: string;
			title: string;
		}> = [];

		for (const file of files) {
			const frontmatter = await this.options.vault.getFrontmatter(file.path);

			if (!isMnemeConceptFrontmatter(frontmatter)) {
				continue;
			}

			const markdown = await this.options.vault.readMarkdown(file.path);
			candidates.push({
				cardsPath: parseCardsPath(getCardGroupLinkFromConceptFrontmatter(frontmatter)),
				conceptId: getConceptIdFromFrontmatter(frontmatter),
				file,
				frontmatter,
				markdown,
				title: parseConceptTitle(markdown, file.path),
			});
		}

		const idCounts = new Map<string, number>();
		for (const candidate of candidates) {
			if (candidate.conceptId) {
				idCounts.set(candidate.conceptId, (idCounts.get(candidate.conceptId) ?? 0) + 1);
			}
		}

		const concepts: ConceptSummary[] = [];
		const identityIssues: ConceptIdentityIssue[] = [];
		const staleSourceIssues: ConceptStaleSourceIssue[] = [];
		for (const candidate of candidates) {
			const { cardsPath, conceptId, file, frontmatter, markdown, title } = candidate;
			if (!conceptId || (idCounts.get(conceptId) ?? 0) > 1) {
				identityIssues.push({
					cardsPath,
					conceptId,
					kind: conceptId ? "duplicate_id" : "missing_id",
					path: file.path,
					title,
					updatedAt: file.mtime,
				});
				continue;
			}

			const sourceLinks = await this.getSourceLinks(conceptId);
			const sourceCount = sourceLinks
				? sourceLinks.filter((link) => link.status === "approved").length
				: undefined;
			const summary: ConceptSummary = {
				cardsPath,
				conceptId,
				coreMeaning: extractCoreMeaning(markdown),
				importance: getImportance(frontmatter),
				learningMode: getLearningMode(frontmatter),
				path: file.path,
				sourceCount,
				tags: getTags(frontmatter),
				title,
				updatedAt: file.mtime,
				whyItMatters: extractWhyItMatters(markdown),
			};

			concepts.push(summary);
			for (const link of sourceLinks?.filter((candidateLink) => candidateLink.status === "stale") ?? []) {
				staleSourceIssues.push({
					conceptId,
					conceptPath: file.path,
					conceptTitle: title,
					link,
				});
			}
		}

		const sortedConcepts = concepts.sort(compareConceptSummariesByTitle);
		return {
			concepts: sortedConcepts,
			duplicateCandidates: detectConceptDuplicates(sortedConcepts),
			identityIssues: identityIssues.sort((first, second) => first.path.localeCompare(second.path)),
			staleSourceIssues: staleSourceIssues.sort((first, second) => first.conceptTitle.localeCompare(second.conceptTitle)
				|| first.link.sourcePath.localeCompare(second.link.sourcePath)),
		};
	}

	private async getSourceLinks(conceptId: string): Promise<ConceptSourceLink[] | undefined> {
		if (!this.options.conceptSourceLinkStore) {
			return undefined;
		}

		return this.options.conceptSourceLinkStore.listByConceptId(conceptId);
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

function getTags(frontmatter: Record<string, unknown>): string[] | undefined {
	const tags = normalizeTags(frontmatter.tags);

	return tags.length > 0 ? tags : undefined;
}

function normalizeTags(value: unknown): string[] {
	const rawTags = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(",")
			: [];
	const normalized = rawTags
		.map((tag) => typeof tag === "string" ? normalizeTag(tag) : "")
		.filter((tag): tag is string => tag.length > 0);

	return [...new Set(normalized)];
}

function normalizeTag(value: string): string {
	return value
		.trim()
		.replace(/^#+/, "")
		.replace(/^\[|\]$/g, "")
		.replace(/^['"]|['"]$/g, "")
		.trim()
		.toLocaleLowerCase()
		.replace(/\s+/g, "-");
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
