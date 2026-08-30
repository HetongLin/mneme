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
	getConceptEnglishNameFromFrontmatter,
	getCardGroupPathFromConceptFrontmatter,
	getConceptIdFromFrontmatter,
	getConceptPrimaryTitleFromFrontmatter,
	isMnemeConceptFrontmatter,
} from "./conceptMarkdownIdentity";
import {
	extractCoreMeaning,
	extractWhyItMatters,
	parseConceptTitle,
} from "./conceptMarkdownParser";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";
import { detectConceptDuplicates } from "./conceptDuplicateDetector";
import { parseConceptRetentionTarget } from "./conceptRetentionPolicy";
import {
	comparableConceptPath,
	parseRelatedConceptLinks,
} from "./conceptRelatedLinks";

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
			const markdown = await this.options.vault.readMarkdown(file.path);
			const cachedFrontmatter = await this.options.vault.getFrontmatter(file.path);
			const frontmatter = isRecord(cachedFrontmatter)
				? cachedFrontmatter
				: parseSimpleFrontmatter(markdown);

			if (!isMnemeConceptFrontmatter(frontmatter)) {
				continue;
			}

			candidates.push({
				cardsPath: getCardGroupPathFromConceptFrontmatter(frontmatter),
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
		const markdownByConceptId = new Map<string, string>();
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
				englishName: getConceptEnglishNameFromFrontmatter(frontmatter),
				importance: getImportance(frontmatter),
				learningMode: getLearningMode(frontmatter),
				path: file.path,
				primaryTitle: getConceptPrimaryTitleFromFrontmatter(frontmatter),
				retentionTarget: parseConceptRetentionTarget(frontmatter.retention_target),
				sourceCount,
				tags: getTags(frontmatter),
				title,
				updatedAt: file.mtime,
				whyItMatters: extractWhyItMatters(markdown),
			};

			concepts.push(summary);
			markdownByConceptId.set(conceptId, markdown);
			for (const link of sourceLinks?.filter((candidateLink) => candidateLink.status === "stale") ?? []) {
				staleSourceIssues.push({
					conceptId,
					conceptPath: file.path,
					conceptTitle: title,
					link,
				});
			}
		}

		const conceptsByPath = new Map(concepts.map((concept) => [comparableConceptPath(concept.path), concept]));
		const conceptsByBasename = createUniqueBasenameIndex(concepts);
		const relatedIdsByConceptId = new Map(concepts.map((concept) => [concept.conceptId, new Set<string>()]));
		for (const concept of concepts) {
			const markdown = markdownByConceptId.get(concept.conceptId) ?? "";
			const relatedConcepts = parseRelatedConceptLinks(markdown)
				.map((link) => conceptsByPath.get(comparableConceptPath(link.target))
					?? conceptsByBasename.get(comparableConceptPath(link.target).split("/").pop() ?? ""))
				.filter((related): related is ConceptSummary => !!related && related.conceptId !== concept.conceptId);
			for (const related of relatedConcepts) {
				relatedIdsByConceptId.get(concept.conceptId)?.add(related.conceptId);
				relatedIdsByConceptId.get(related.conceptId)?.add(concept.conceptId);
			}
		}
		for (const concept of concepts) {
			concept.relatedConceptIds = [...(relatedIdsByConceptId.get(concept.conceptId) ?? [])].sort();
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

function createUniqueBasenameIndex(concepts: ConceptSummary[]): Map<string, ConceptSummary> {
	const candidates = new Map<string, ConceptSummary[]>();
	for (const concept of concepts) {
		const basename = comparableConceptPath(concept.path).split("/").pop() ?? "";
		candidates.set(basename, [...(candidates.get(basename) ?? []), concept]);
	}

	return new Map([...candidates.entries()]
		.filter(([, matches]) => matches.length === 1)
		.map(([basename, matches]) => [basename, matches[0] as ConceptSummary]));
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareConceptSummariesByTitle(first: ConceptSummary, second: ConceptSummary): number {
	return first.title.localeCompare(second.title, undefined, { sensitivity: "base" })
		|| first.path.localeCompare(second.path);
}
