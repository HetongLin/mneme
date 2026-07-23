import type { ConceptSummary } from "../models/conceptLibrary";
import { normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";

export interface RelatedConceptLink {
	display?: string;
	target: string;
}

export function createRelatedConceptPairKey(firstConceptId: string, secondConceptId: string): string {
	return JSON.stringify([firstConceptId, secondConceptId].sort());
}

export function parseRelatedConceptLinks(markdown: string): RelatedConceptLink[] {
	const section = findRelatedSection(markdown);
	if (!section) return [];
	const links: RelatedConceptLink[] = [];
	const seen = new Set<string>();
	let fence: string | undefined;

	for (const line of section.lines.slice(section.start + 1, section.end)) {
		fence = updateFence(fence, line);
		if (fence || /^\s*(```+|~~~+)/.test(line)) continue;
		for (const match of line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)) {
			const target = match[1]?.trim();
			if (!target) continue;
			const key = comparableConceptPath(target);
			if (seen.has(key)) continue;
			seen.add(key);
			links.push({ display: match[2]?.trim() || undefined, target });
		}
	}

	return links;
}

export function addRelatedConceptLink(
	markdown: string,
	target: Pick<ConceptSummary, "path" | "title">,
): { changed: boolean; markdown: string } {
	const targetKey = comparableConceptPath(target.path);
	if (parseRelatedConceptLinks(markdown).some((link) => relatedTargetMatches(link.target, targetKey))) {
		return { changed: false, markdown };
	}

	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	const linkLine = `- ${toObsidianInternalLink(target.path, target.title)}`;
	const section = findRelatedSection(markdown);
	if (!section) {
		const trimmed = markdown.trimEnd();
		return {
			changed: true,
			markdown: `${trimmed}${newline}${newline}## Related Concepts${newline}${newline}${linkLine}${newline}`,
		};
	}

	const lines = [...section.lines];
	let insertion = section.end;
	while (insertion > section.start + 1 && (lines[insertion - 1] ?? "").trim().length === 0) {
		insertion -= 1;
	}
	const needsLeadingBlank = insertion === section.start + 1 || (lines[insertion - 1] ?? "").trim().length > 0;
	lines.splice(insertion, 0, ...(needsLeadingBlank ? [""] : []), linkLine);

	return { changed: true, markdown: lines.join(newline) };
}

export function removeRelatedConceptLink(
	markdown: string,
	targetPath: string,
): { changed: boolean; markdown: string; removals: number } {
	const section = findRelatedSection(markdown);
	if (!section) return { changed: false, markdown, removals: 0 };
	const targetKey = comparableConceptPath(targetPath);
	const lines = [...section.lines];
	let removals = 0;
	let fence: string | undefined;

	for (let index = section.start + 1; index < section.end; index += 1) {
		const line = lines[index] ?? "";
		fence = updateFence(fence, line);
		if (fence || /^\s*(```+|~~~+)/.test(line)) continue;
		const nextLine = line.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, (whole, rawTarget: string) => {
			if (!relatedTargetMatches(rawTarget.trim(), targetKey)) return whole;
			removals += 1;
			return "";
		});
		lines[index] = /^\s*[-*+]\s*$/.test(nextLine) ? "" : nextLine;
	}

	if (removals === 0) return { changed: false, markdown, removals: 0 };
	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	let nextLines = lines;
	const nextSection = findRelatedSection(nextLines.join(newline));
	if (nextSection && sectionContainsOnlyWhitespace(nextSection)) {
		let removeStart = nextSection.start;
		let removeEnd = nextSection.end;
		while (removeStart > 0 && (nextLines[removeStart - 1] ?? "").trim().length === 0) removeStart -= 1;
		while (removeEnd < nextLines.length && (nextLines[removeEnd] ?? "").trim().length === 0) removeEnd += 1;
		const before = nextLines.slice(0, removeStart);
		const after = nextLines.slice(removeEnd);
		nextLines = before.length > 0 && after.length > 0 ? [...before, "", ...after] : before.concat(after);
	}

	const result = nextLines.join(newline);
	return {
		changed: true,
		markdown: markdown.endsWith(newline) && !result.endsWith(newline) ? `${result}${newline}` : result,
		removals,
	};
}

export function replaceRelatedConceptLink(
	markdown: string,
	oldTargetPath: string,
	newTarget: Pick<ConceptSummary, "path" | "title">,
): { changed: boolean; markdown: string } {
	const removed = removeRelatedConceptLink(markdown, oldTargetPath);
	if (!removed.changed) return { changed: false, markdown };
	const added = addRelatedConceptLink(removed.markdown, newTarget);
	return { changed: true, markdown: added.markdown };
}

export function comparableConceptPath(path: string): string {
	return normalizeVaultPath(path).replace(/\.md$/i, "").toLocaleLowerCase();
}

function findRelatedSection(markdown: string): { end: number; lines: string[]; start: number } | undefined {
	const lines = markdown.split(/\r?\n/);
	let fence: string | undefined;
	let start = -1;
	let level = 2;

	for (let index = 0; index < lines.length; index += 1) {
		fence = updateFence(fence, lines[index] ?? "");
		if (fence) continue;
		const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? "");
		if (heading?.[1]?.length === 2 && heading[2]?.trim().toLocaleLowerCase() === "related concepts") {
			start = index;
			level = heading[1]?.length ?? 2;
			break;
		}
	}
	if (start < 0) return undefined;

	fence = undefined;
	for (let index = start + 1; index < lines.length; index += 1) {
		fence = updateFence(fence, lines[index] ?? "");
		if (fence) continue;
		const heading = /^(#{1,6})\s+/.exec(lines[index] ?? "");
		if (heading && (heading[1]?.length ?? 7) <= level) {
			return { end: index, lines, start };
		}
	}

	return { end: lines.length, lines, start };
}

function sectionContainsOnlyWhitespace(section: { end: number; lines: string[]; start: number }): boolean {
	return section.lines.slice(section.start + 1, section.end).every((line) => line.trim().length === 0);
}

function relatedTargetMatches(candidate: string, targetComparablePath: string): boolean {
	const candidateComparablePath = comparableConceptPath(candidate);
	if (candidateComparablePath === targetComparablePath) return true;
	if (candidateComparablePath.includes("/") && targetComparablePath.includes("/")) return false;

	return candidateComparablePath.split("/").pop() === targetComparablePath.split("/").pop();
}

function updateFence(current: string | undefined, line: string): string | undefined {
	const marker = line.trim().match(/^(```+|~~~+)/)?.[1]?.[0];
	if (!marker) return current;
	if (!current) return marker;
	return current === marker ? undefined : current;
}
