import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";

export interface ConceptEditableMetadata {
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
}

export interface ConceptMetadataUpdate {
	importance?: ConceptImportance | null;
	learningMode?: ConceptLearningMode | null;
}

export function readConceptEditableMetadata(markdown: string): ConceptEditableMetadata {
	const frontmatter = getFrontmatterLines(markdown);

	if (!frontmatter) {
		return {};
	}

	const importance = readScalar(frontmatter.lines, "importance");
	const learningMode = readScalar(frontmatter.lines, "learning_mode");

	return {
		importance: isImportance(importance) ? importance : undefined,
		learningMode: isLearningMode(learningMode) ? learningMode : undefined,
	};
}

export function updateConceptMetadata(markdown: string, update: ConceptMetadataUpdate): string {
	const frontmatter = getFrontmatterLines(markdown);

	if (!frontmatter) {
		throw new Error("Concept frontmatter is required.");
	}

	let lines = [...frontmatter.lines];

	if (update.learningMode !== undefined) {
		lines = setScalar(lines, "learning_mode", update.learningMode);
	}

	if (update.importance !== undefined) {
		lines = setScalar(lines, "importance", update.importance);
	}

	return [
		"---",
		...lines,
		"---",
		markdown.slice(frontmatter.bodyStart),
	].join("\n");
}

function getFrontmatterLines(markdown: string): { bodyStart: number; lines: string[] } | undefined {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

	const fullMatch = match?.[0];

	if (!match || !fullMatch || match.index !== 0) {
		return undefined;
	}

	return {
		bodyStart: fullMatch.length,
		lines: (match[1] ?? "").split(/\r?\n/),
	};
}

function readScalar(lines: string[], key: string): string | undefined {
	const match = lines.find((line) => new RegExp(`^${key}\\s*:`).test(line));
	const value = match?.slice(match.indexOf(":") + 1).trim().replace(/^['"]|['"]$/g, "");

	return value || undefined;
}

function setScalar(lines: string[], key: string, value: string | null): string[] {
	const result = [...lines];
	const index = result.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));

	if (value === null) {
		if (index >= 0) {
			result.splice(index, 1);
		}

		return result;
	}

	const nextLine = `${key}: ${value}`;

	if (index >= 0) {
		result[index] = nextLine;
	} else {
		result.push(nextLine);
	}

	return result;
}

function isImportance(value: string | undefined): value is ConceptImportance {
	return value === "low" || value === "normal" || value === "high" || value === "critical";
}

function isLearningMode(value: string | undefined): value is ConceptLearningMode {
	return value === "reviewable" || value === "exploratory";
}
