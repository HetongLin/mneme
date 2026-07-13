import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import type { MnemeSettings } from "../models/settings";
import { buildCardGroupPath, buildConceptPath, ensureUniquePath, normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import { createStableConceptId } from "./conceptIdEditor";
import { renderConceptMarkdown } from "./conceptMarkdownRenderer";

export interface ManualConceptInput {
	coreMeaning: string;
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
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

export async function createManualConcept(
	input: ManualConceptInput,
	settings: MnemeSettings,
	vault: ManualConceptVault,
	createId: () => string = () => createStableConceptId(),
): Promise<ManualConceptResult> {
	const title = input.title.trim();
	const coreMeaning = input.coreMeaning.trim();
	if (!title) {
		throw new Error("Title is required.");
	}
	if (!coreMeaning) {
		throw new Error("Core Meaning is required.");
	}

	const desiredPath = buildConceptPath(settings.conceptsFolder, title);
	const occupied = new Set<string>();
	let path = desiredPath;
	while (await vault.exists(path)) {
		occupied.add(path);
		path = ensureUniquePath(occupied, desiredPath);
	}
	await ensureParentFolders(path, vault);

	const conceptId = createId();
	const cardGroupPath = buildCardGroupPath(settings.cardsFolder, getMarkdownFileStem(path));
	const markdown = renderConceptMarkdown({
		cardGroupLink: toObsidianInternalLink(cardGroupPath, `${title} Cards`),
		conceptId,
		coreMeaning,
		importance: input.importance,
		learningMode: input.learningMode ?? "reviewable",
		tags: input.tags,
		title,
		whyItMatters: input.whyItMatters,
	});
	await vault.create(path, markdown);

	return { conceptId, path };
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
