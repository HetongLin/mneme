import { normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";

export type RelinkConceptSourceResult =
	| { markdown: string; replacements: number; status: "relinked" }
	| { markdown: string; replacements: 0; status: "not_found" };

export function relinkConceptSourcePath(
	markdown: string,
	oldSourcePath: string,
	newSourcePath: string,
): RelinkConceptSourceResult {
	const oldPath = normalizeComparablePath(oldSourcePath);
	const normalizedNewPath = normalizeVaultPath(newSourcePath);
	if (!oldPath || !normalizedNewPath) {
		throw new Error("Both old and new Source paths are required.");
	}

	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	const lines = markdown.split(/\r?\n/);
	const sectionStart = findLevelTwoHeading(lines, "Source Notes");
	if (sectionStart < 0) {
		return { markdown, replacements: 0, status: "not_found" };
	}
	const sectionEnd = findNextLevelTwoHeading(lines, sectionStart + 1);
	let replacements = 0;
	const updatedSection = lines.slice(sectionStart + 1, sectionEnd).map((line) => {
		return line.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (fullMatch, path: string, alias?: string) => {
			if (normalizeComparablePath(path) !== oldPath) {
				return fullMatch;
			}
			replacements += 1;
			return toObsidianInternalLink(normalizedNewPath, alias?.trim() || undefined);
		});
	});

	if (replacements === 0) {
		return { markdown, replacements: 0, status: "not_found" };
	}
	const updatedLines = [
		...lines.slice(0, sectionStart + 1),
		...updatedSection,
		...lines.slice(sectionEnd),
	];

	return {
		markdown: updatedLines.join(newline),
		replacements,
		status: "relinked",
	};
}

function normalizeComparablePath(path: string): string {
	return normalizeVaultPath(path).replace(/\.md$/i, "").toLocaleLowerCase();
}

function findLevelTwoHeading(lines: string[], title: string): number {
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

function updateFence(current: string | undefined, line: string): string | undefined {
	const marker = line.trim().match(/^(```+|~~~+)/)?.[1]?.[0];
	if (!marker) {
		return current;
	}
	return current ? undefined : marker;
}
