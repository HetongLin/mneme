import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";

export interface ConceptEditableMetadata {
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	tags: string[];
}

export interface ConceptMetadataUpdate {
	importance?: ConceptImportance | null;
	learningMode?: ConceptLearningMode | null;
	tags?: string[] | null;
}

export function readConceptEditableMetadata(markdown: string): ConceptEditableMetadata {
	const frontmatter = getFrontmatterLines(markdown);

	if (!frontmatter) {
		return { tags: [] };
	}

	const importance = readScalar(frontmatter.lines, "importance");
	const learningMode = readScalar(frontmatter.lines, "learning_mode");

	return {
		importance: isImportance(importance) ? importance : undefined,
		learningMode: isLearningMode(learningMode) ? learningMode : undefined,
		tags: readTags(frontmatter.lines),
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

	if (update.tags !== undefined) {
		lines = setTags(lines, update.tags);
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

function readTags(lines: string[]): string[] {
	const lineIndex = lines.findIndex((line) => /^tags\s*:/.test(line));

	if (lineIndex < 0) {
		return [];
	}

	const line = lines[lineIndex] ?? "";
	const value = line.slice(line.indexOf(":") + 1).trim();

	if (value.startsWith("[") && value.endsWith("]")) {
		return normalizeTags(value.slice(1, -1).split(","));
	}

	if (value.length > 0) {
		return normalizeTags(value.split(","));
	}

	const blockTags: string[] = [];

	for (let index = lineIndex + 1; index < lines.length; index += 1) {
		const blockLine = lines[index] ?? "";
		const match = blockLine.match(/^\s*-\s+(.+?)\s*$/);

		if (!match) {
			break;
		}

		blockTags.push(match[1] ?? "");
	}

	return normalizeTags(blockTags);
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

function setTags(lines: string[], value: string[] | null): string[] {
	const tags = normalizeTags(value ?? []);
	const result = removeTags(lines);

	if (tags.length === 0) {
		return result;
	}

	result.push(`tags: [${tags.join(", ")}]`);

	return result;
}

function removeTags(lines: string[]): string[] {
	const result: string[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";

		if (!/^tags\s*:/.test(line)) {
			result.push(line);
			continue;
		}

		if (line.slice(line.indexOf(":") + 1).trim().length > 0) {
			continue;
		}

		for (index += 1; index < lines.length; index += 1) {
			const blockLine = lines[index] ?? "";

			if (!/^\s*-\s+/.test(blockLine)) {
				index -= 1;
				break;
			}
		}
	}

	return result;
}

function normalizeTags(value: string[]): string[] {
	const tags = value
		.map(normalizeTag)
		.filter((tag) => tag.length > 0);

	return [...new Set(tags)];
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

function isImportance(value: string | undefined): value is ConceptImportance {
	return value === "low" || value === "normal" || value === "high" || value === "critical";
}

function isLearningMode(value: string | undefined): value is ConceptLearningMode {
	return value === "reviewable" || value === "exploratory";
}
