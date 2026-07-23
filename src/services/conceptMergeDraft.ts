import type {
	ConceptImportance,
	ConceptLearningMode,
	ConceptSummary,
} from "../models/conceptLibrary";
import { composeConceptDisplayTitle, isCanonicalEnglishName } from "./conceptNaming";
import { updateConceptMetadata } from "./conceptMetadataUpdater";
import { updateConceptSections } from "./conceptSectionUpdater";

export interface ConceptMergeDraft {
	coreMeaning: string;
	englishName: string;
	importance: ConceptImportance;
	learningMode: ConceptLearningMode;
	tags: string[];
	title: string;
	whyItMatters: string;
}

const IMPORTANCE_RANK: Record<ConceptImportance, number> = {
	critical: 4,
	high: 3,
	normal: 2,
	low: 1,
};

export function createManualConceptMergeDraft(
	first: ConceptSummary,
	second: ConceptSummary,
	survivor: ConceptSummary,
): ConceptMergeDraft {
	return {
		coreMeaning: combineDistinctSections(first.coreMeaning, second.coreMeaning),
		englishName: survivor.englishName?.trim() || survivor.primaryTitle?.trim() || survivor.title.trim(),
		importance: strongerImportance(first.importance, second.importance),
		learningMode: first.learningMode === "reviewable" || second.learningMode === "reviewable"
			? "reviewable"
			: "exploratory",
		tags: [...new Set([...(first.tags ?? []), ...(second.tags ?? [])])],
		title: survivor.primaryTitle?.trim() || survivor.title.trim(),
		whyItMatters: combineDistinctSections(first.whyItMatters, second.whyItMatters),
	};
}

export function applyConceptMergeDraft(
	markdown: string,
	draft: ConceptMergeDraft,
): string {
	const title = draft.title.trim();
	const englishName = draft.englishName.trim();
	if (!title) throw new Error("Merged Concept Title is required.");
	if (!isCanonicalEnglishName(englishName)) {
		throw new Error("Merged Concept English Name must be a canonical English term.");
	}
	if (!draft.coreMeaning.trim()) throw new Error("Merged Concept Core Meaning is required.");

	let updated = setFrontmatterScalar(markdown, "mneme_title", JSON.stringify(title));
	updated = setFrontmatterScalar(updated, "mneme_english_name", JSON.stringify(englishName));
	updated = replaceFirstHeading(updated, composeConceptDisplayTitle(title, englishName));
	updated = updateConceptSections(updated, {
		coreMeaning: draft.coreMeaning,
		whyItMatters: draft.whyItMatters,
	}).markdown;
	updated = updateConceptMetadata(updated, {
		importance: draft.importance,
		learningMode: draft.learningMode,
		tags: draft.tags,
	});

	return updated;
}

function combineDistinctSections(first: string | undefined, second: string | undefined): string {
	const sections = [first, second]
		.map((value) => value?.trim() ?? "")
		.filter(Boolean);
	const seen = new Set<string>();

	return sections.filter((value) => {
		const key = value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ");
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	}).join("\n\n");
}

function strongerImportance(
	first: ConceptImportance | undefined,
	second: ConceptImportance | undefined,
): ConceptImportance {
	const left = first ?? "normal";
	const right = second ?? "normal";
	return IMPORTANCE_RANK[left] >= IMPORTANCE_RANK[right] ? left : right;
}

function replaceFirstHeading(markdown: string, title: string): string {
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown)?.[0] ?? "";
	const body = markdown.slice(frontmatter.length);
	const updatedBody = /^#\s+.+?\s*#*\s*$/m.test(body)
		? body.replace(/^#\s+.+?\s*#*\s*$/m, `# ${title}`)
		: `# ${title}\n\n${body.trimStart()}`;
	return `${frontmatter}${updatedBody}`;
}

function setFrontmatterScalar(markdown: string, key: string, value: string): string {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	if (!match) throw new Error("Concept frontmatter is required.");
	const lines = (match[1] ?? "").split(/\r?\n/);
	const indexes = lines.flatMap((line, index) => new RegExp(`^${key}\\s*:`).test(line) ? [index] : []);
	if (indexes.length > 1) throw new Error(`Frontmatter field appears more than once: ${key}`);
	if (indexes[0] === undefined) lines.push(`${key}: ${value}`);
	else lines[indexes[0]] = `${key}: ${value}`;
	return `---\n${lines.join("\n")}\n---\n${markdown.slice(match[0]!.length)}`;
}
