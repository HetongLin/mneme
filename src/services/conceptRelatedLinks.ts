import type { ConceptSummary } from "../models/conceptLibrary";
import { normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import { inspectMarkdownLines } from "./markdownLineInspector";

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
	for (let index = section.start + 1; index < section.end; index += 1) {
		for (const match of relatedLinksOnLine(section, index)) {
			const target = match.target;
			const key = comparableConceptPath(target);
			if (seen.has(key)) continue;
			seen.add(key);
			links.push({ display: match.display, target });
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
		if (inspectMarkdownLines(markdown).openLiteral) throw new Error("Close the code fence or comment before adding Related Concepts.");
		const trimmed = markdown.trimEnd();
		return {
			changed: true,
			markdown: `${trimmed}${newline}${newline}## Related Concepts${newline}${newline}${linkLine}${newline}`,
		};
	}
	if (section.end === section.lines.length && section.openLiteral) {
		throw new Error("Close the code fence or comment before adding Related Concepts.");
	}

	const lines = [...section.lines];
	let insertion = section.end;
	while (insertion > section.start + 1 && (lines[insertion - 1] ?? "").trim().length === 0) {
		insertion -= 1;
	}
	const needsLeadingBlank = insertion === section.start + 1 || (lines[insertion - 1] ?? "").trim().length > 0;
	lines.splice(insertion, 0, ...(needsLeadingBlank ? [""] : []), linkLine);

	return { changed: true, markdown: section.frontmatter + lines.join(newline) };
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

	for (let index = section.start + 1; index < section.end; index += 1) {
		const line = lines[index] ?? "";
		const matches = relatedLinksOnLine(section, index)
			.filter((match) => relatedTargetMatches(match.target, targetKey));
		if (matches.length === 0) continue;
		removals += matches.length;
		const nextLine = matches.reduceRight((text, match) => text.slice(0, match.start) + text.slice(match.end), line);
		lines[index] = /^\s*[-*+]\s*$/.test(nextLine) ? "" : nextLine;
	}

	if (removals === 0) return { changed: false, markdown, removals: 0 };
	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	let nextLines = lines;
	const nextSection = findRelatedSection(section.frontmatter + nextLines.join(newline));
	if (nextSection && sectionContainsOnlyWhitespace(nextSection)) {
		let removeStart = nextSection.start;
		let removeEnd = nextSection.end;
		while (removeStart > 0 && (nextLines[removeStart - 1] ?? "").trim().length === 0) removeStart -= 1;
		while (removeEnd < nextLines.length && (nextLines[removeEnd] ?? "").trim().length === 0) removeEnd += 1;
		const before = nextLines.slice(0, removeStart);
		const after = nextLines.slice(removeEnd);
		nextLines = before.length > 0 && after.length > 0 ? [...before, "", ...after] : before.concat(after);
	}

	const result = section.frontmatter + nextLines.join(newline);
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

interface RelatedSection {
	frontmatter: string;
	lines: string[];
	activeLines: string[];
	openLiteral: boolean;
	start: number;
	end: number;
}

function relatedLinksOnLine(section: RelatedSection, index: number): Array<RelatedConceptLink & { start: number; end: number }> {
	const links: Array<RelatedConceptLink & { start: number; end: number }> = [];
	for (const match of (section.activeLines[index] ?? "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)) {
		const whole = match[0];
		const start = match.index;
		const target = match[1]?.trim();
		if (!whole || start === undefined || !target) continue;
		const end = start + whole.length;
		if (section.lines[index]?.slice(start, end) !== whole) continue;
		links.push({ start, end, target, display: match[2]?.trim() || undefined });
	}
	return links;
}

function findRelatedSection(markdown: string): RelatedSection | undefined {
	const inspected = inspectMarkdownLines(markdown);
	const start = inspected.lines.findIndex((line) => line.heading && !line.heading.indent
		&& line.heading.level === 2 && line.heading.title.toLocaleLowerCase() === "related concepts");
	if (start < 0) return undefined;
	let end = inspected.lines.length;
	for (let index = start + 1; index < inspected.lines.length; index += 1) {
		const heading = inspected.lines[index]?.heading;
		if (heading && !heading.indent && heading.level <= 2) {
			end = index;
			break;
		}
	}
	return {
		frontmatter: inspected.frontmatter, lines: inspected.lines.map((line) => line.text),
		activeLines: inspected.lines.map((line) => line.activeText), openLiteral: inspected.openLiteral,
		start, end,
	};
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
