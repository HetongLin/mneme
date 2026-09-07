import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import { buildCardGroupPath, buildConceptPath, normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import { renderConceptMarkdown } from "./conceptMarkdownRenderer";
import {
	isCanonicalEnglishName,
	normalizeConceptNames,
} from "./conceptNaming";
import { createRandomConceptId } from "./entityId";

export interface ManualConceptInput {
	draftId?: string;
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
}

export interface PreparedManualConcept extends ManualConceptResult {
	cardsPath: string;
	markdown: string;
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
	const prepared = await prepareManualConcept(input, settings, vault, createId, isConceptIdReserved);
	await writePreparedManualConcept(prepared, vault);
	const result = { conceptId: prepared.conceptId, path: prepared.path };
	// Never delete an authored note after an uncertain state save. Production callers
	// use the durable coordinator to finish state and draft completion on retry.
	await committer?.commit(input, result);
	return result;
}

export async function prepareManualConcept(
	input: ManualConceptInput,
	settings: MnemeSettings,
	vault: ManualConceptVault,
	createId: () => string = createRandomConceptId,
	isConceptIdReserved?: (conceptId: string) => Promise<boolean>,
	reservedPaths: ReadonlySet<string> = new Set(),
): Promise<PreparedManualConcept> {
	const enteredTitle = input.title.trim();
	const coreMeaning = input.coreMeaning.trim();
	if (!enteredTitle) {
		throw new Error("Title is required.");
	}
	if (!coreMeaning) {
		throw new Error("Core Meaning is required.");
	}

	const names = normalizeConceptNames(
		enteredTitle,
		input.englishName,
		settings.suggestEnglishAliases,
	);
	if (names.englishName && !isCanonicalEnglishName(names.englishName)) {
		throw new Error("English Alias must contain only Latin-script letters.");
	}
	const baseDisplayTitle = names.displayTitle;
	const desiredPath = buildConceptPath(settings.conceptsFolder, baseDisplayTitle);
	let conceptId = createId();
	for (let attempt = 0; await isConceptIdReserved?.(conceptId) === true; attempt += 1) {
		if (attempt >= 127) {
			throw new Error("No available random Concept ID could be allocated.");
		}
		conceptId = createId();
	}
	let path = desiredPath;
	let suffix = 1;
	while (reservedPaths.has(path) || await vault.exists(path)) {
		suffix += 1;
		path = appendPathSuffix(desiredPath, suffix);
		if (suffix >= 10_000) {
			throw new Error("No available Concept path could be allocated.");
		}
	}
	const cardGroupPath = buildCardGroupPath(settings.cardsFolder, getMarkdownFileStem(path));
	const markdown = renderManualConcept(input, conceptId, cardGroupPath, settings.suggestEnglishAliases);
	return { conceptId, path, cardsPath: cardGroupPath, markdown };
}

export function renderManualConcept(input: ManualConceptInput, conceptId: string, cardsPath: string, englishAliasesEnabled: boolean): string {
	const names = normalizeConceptNames(input.title.trim(), input.englishName, englishAliasesEnabled);
	return renderConceptMarkdown({
		cardGroupLink: toObsidianInternalLink(cardsPath, `${names.displayTitle} Cards`),
		conceptId,
		coreMeaning: input.coreMeaning.trim(),
		englishName: names.englishName,
		importance: input.importance,
		learningMode: input.learningMode ?? "reviewable",
		sourcePath: input.sourcePath?.trim() || undefined,
		tags: input.tags,
		title: names.title,
		whyItMatters: input.whyItMatters,
	});
}

export async function writePreparedManualConcept(prepared: PreparedManualConcept, vault: ManualConceptVault): Promise<void> {
	await ensureParentFolders(prepared.path, vault);
	await vault.create(prepared.path, prepared.markdown);
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
