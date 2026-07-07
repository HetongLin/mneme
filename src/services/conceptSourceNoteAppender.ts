import type { ConceptSourceLinkDraft } from "../models/knowledgeProposal";
import { normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";

export interface SourceNoteAppendResult {
	markdown: string;
	status: "appended" | "unchanged";
}

export function appendConceptSourceNote(
	markdown: string,
	link: ConceptSourceLinkDraft,
): SourceNoteAppendResult {
	const sourcePath = normalizeVaultPath(link.sourcePath);

	if (!sourcePath) {
		throw new Error("Source note path is required.");
	}

	const lines = markdown.split(/\r?\n/);
	const sectionStart = findHeading(lines, "Source Notes");
	const sourceLink = toObsidianInternalLink(sourcePath);
	const entryLines = buildEntryLines(sourceLink, link);

	if (sectionStart === -1) {
		return {
			markdown: `${markdown.trimEnd()}\n\n## Source Notes\n\n> [!info]- Source Notes\n${entryLines.join("\n")}\n`,
			status: "appended",
		};
	}

	const sectionEnd = findNextLevelTwoHeading(lines, sectionStart + 1);
	const sectionLines = trimLeadingBlankLines(
		trimTrailingBlankLines(lines.slice(sectionStart + 1, sectionEnd)),
	);

	if (containsSourcePath(sectionLines, sourcePath)) {
		return { markdown, status: "unchanged" };
	}

	const placeholderIndex = sectionLines.findIndex((line) => /^>\s*Add source notes here\.\s*$/i.test(line));
	let updatedSection: string[];

	if (placeholderIndex >= 0) {
		updatedSection = [...sectionLines];
		updatedSection.splice(placeholderIndex, 1, ...entryLines);
	} else if (sectionLines.some((line) => /^>\s*\[!info\]-?\s+Source Notes\s*$/i.test(line))) {
		updatedSection = [...trimTrailingBlankLines(sectionLines), ...entryLines];
	} else {
		updatedSection = [
			...trimTrailingBlankLines(sectionLines),
			"> [!info]- Source Notes",
			...entryLines,
		];
	}

	const before = trimTrailingBlankLines(lines.slice(0, sectionStart + 1));
	const after = trimLeadingBlankLines(lines.slice(sectionEnd));
	const combined = [...before, "", ...updatedSection, "", ...after];

	return {
		markdown: `${combined.join("\n").trimEnd()}\n`,
		status: "appended",
	};
}

function buildEntryLines(sourceLink: string, link: ConceptSourceLinkDraft): string[] {
	const lines = [
		`> - ${sourceLink}`,
		`>   - relation: ${link.relationType}`,
	];
	const excerpt = link.evidence?.[0]?.excerpt.trim().replace(/\s+/g, " ");

	if (excerpt) {
		lines.push(`>   - evidence: ${excerpt.slice(0, 180)}`);
	}

	return lines;
}

function containsSourcePath(lines: string[], sourcePath: string): boolean {
	const normalizedTarget = normalizeVaultPath(sourcePath).replace(/\.md$/i, "").toLocaleLowerCase();

	return lines.some((line) => {
		const links = line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g);

		for (const match of links) {
			const candidate = match[1];

			if (candidate && normalizeVaultPath(candidate).replace(/\.md$/i, "").toLocaleLowerCase() === normalizedTarget) {
				return true;
			}
		}

		return false;
	});
}

function findHeading(lines: string[], title: string): number {
	let fence: string | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		fence = updateFence(fence, line);

		if (!fence && line.trim().toLocaleLowerCase() === `## ${title.toLocaleLowerCase()}`) {
			return index;
		}
	}

	return -1;
}

function findNextLevelTwoHeading(lines: string[], start: number): number {
	let fence: string | undefined;

	for (let index = start; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		fence = updateFence(fence, line);

		if (!fence && /^#{1,2}\s+/.test(line)) {
			return index;
		}
	}

	return lines.length;
}

function updateFence(currentFence: string | undefined, line: string): string | undefined {
	const marker = line.trim().match(/^(```+|~~~+)/)?.[1]?.[0];

	if (!marker) {
		return currentFence;
	}

	if (!currentFence) {
		return marker;
	}

	return currentFence === marker ? undefined : currentFence;
}

function trimTrailingBlankLines(lines: string[]): string[] {
	const result = [...lines];

	while (result[result.length - 1]?.trim() === "") {
		result.pop();
	}

	return result;
}

function trimLeadingBlankLines(lines: string[]): string[] {
	const result = [...lines];

	while (result[0]?.trim() === "") {
		result.shift();
	}

	return result;
}
