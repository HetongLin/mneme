import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import { buildCardGroupPath, buildConceptPath, normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import { renderConceptMarkdown } from "./conceptMarkdownRenderer";
import {
	createReadableConceptId,
	isCanonicalEnglishName,
	normalizeConceptNames,
} from "./conceptNaming";

export interface ManualConceptInput {
	coreMeaning: string;
	englishName?: string;
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	sourcePath?: string;
	tags?: string[];
	title: string;
	whyItMatters?: string;
}

export interface ManualConceptResult {
	conceptId: string;
	path: string;
}

export interface ManualConceptVault {
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	remove(path: string): Promise<void>;
}

export interface ManualConceptCommitter {
	commit(input: ManualConceptInput, result: ManualConceptResult): Promise<void>;
}

export async function createManualConcept(
	input: ManualConceptInput,
	settings: MnemeSettings,
	vault: ManualConceptVault,
	createId?: () => string,
	committer?: ManualConceptCommitter,
	isConceptIdReserved?: (conceptId: string) => Promise<boolean>,
): Promise<ManualConceptResult> {
	const enteredTitle = input.title.trim();
	const coreMeaning = input.coreMeaning.trim();
	if (!enteredTitle) {
		throw new Error("Title is required.");
	}
	if (!coreMeaning) {
		throw new Error("Core Meaning is required.");
	}

	const names = normalizeConceptNames(enteredTitle, input.englishName);
	if (!isCanonicalEnglishName(names.englishName)) {
		throw new Error("English Name must contain a canonical English term without Chinese characters.");
	}
	const title = names.title;
	const englishName = names.englishName;
	const baseDisplayTitle = names.displayTitle;
	const desiredPath = buildConceptPath(settings.conceptsFolder, baseDisplayTitle);
	const baseConceptId = createId ? createId() : createReadableConceptId(englishName);
	let conceptId = baseConceptId;
	let displayTitle = baseDisplayTitle;
	let primaryTitle = title;
	let path = desiredPath;
	let suffix = 1;
	while (await vault.exists(path) || await isConceptIdReserved?.(conceptId) === true) {
		suffix += 1;
		conceptId = `${baseConceptId}-${suffix}`;
		primaryTitle = `${title} - ${suffix}`;
		displayTitle = baseDisplayTitle === title
			? primaryTitle
			: normalizeConceptNames(primaryTitle, englishName).displayTitle;
		path = appendPathSuffix(desiredPath, suffix);
		if (suffix >= 10_000) {
			throw new Error("No available readable Concept identity could be allocated.");
		}
	}
	await ensureParentFolders(path, vault);

	const cardGroupPath = buildCardGroupPath(settings.cardsFolder, getMarkdownFileStem(path));
	const markdown = renderConceptMarkdown({
		cardGroupLink: toObsidianInternalLink(cardGroupPath, `${displayTitle} Cards`),
		conceptId,
		coreMeaning,
		englishName,
		importance: input.importance,
		learningMode: input.learningMode ?? "reviewable",
		sourcePath: input.sourcePath?.trim() || undefined,
		tags: input.tags,
		title: primaryTitle,
		whyItMatters: input.whyItMatters,
	});
	await vault.create(path, markdown);
	const result = { conceptId, path };

	try {
		await committer?.commit(input, result);
	} catch (error) {
		try {
			await vault.remove(path);
		} catch (rollbackError) {
			throw new Error([
				error instanceof Error ? error.message : String(error),
				`Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
			].join(" "));
		}
		throw error;
	}

	return result;
}

function appendPathSuffix(path: string, suffix: number): string {
	const extensionIndex = path.lastIndexOf(".");
	const slashIndex = path.lastIndexOf("/");
	const hasExtension = extensionIndex > slashIndex;
	const basePath = hasExtension ? path.slice(0, extensionIndex) : path;
	const extension = hasExtension ? path.slice(extensionIndex) : "";

	return `${basePath}-${suffix}${extension}`;
}

function getMarkdownFileStem(path: string): string {
	const basename = normalizeVaultPath(path).split("/").pop() ?? "Concept";
	return basename.replace(/\.md$/i, "");
}

async function ensureParentFolders(path: string, vault: ManualConceptVault): Promise<void> {
	const parts = normalizeVaultPath(path).split("/");
	parts.pop();
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!(await vault.exists(current))) {
			await vault.createFolder(current);
		}
	}
}
