import { toObsidianInternalLink } from "../utils/markdownPath";
import { getCardGroupPathFromConceptFrontmatter } from "./conceptMarkdownIdentity";
import { parseRelatedConceptLinks, removeRelatedConceptLink } from "./conceptRelatedLinks";
import { readMarkdownScalar } from "./markdownScalar";

interface BodyLine {
	text: string;
	ending: string;
	literal: boolean;
	heading?: { indent: string; level: number; content: string; title: string };
}

export function extractMergedPerspective(markdown: string): string | undefined {
	for (const link of parseRelatedConceptLinks(markdown)) {
		markdown = removeRelatedConceptLink(markdown, link.target).markdown;
	}
	const cardsPath = getCardGroupPathFromConceptFrontmatter({
		mneme_type: "concept",
		cards: readMarkdownScalar(markdown, "cards"),
		cards_folder: readMarkdownScalar(markdown, "cards_folder"),
	});
	const { lines } = inspectBodyLines(rewriteManagedCardNavigation(markdown, cardsPath));
	const firstContent = lines.findIndex((line) => line.text.trim().length > 0);
	// Only a leading document title is redundant with the generated View title.
	const titleIndex = lines[firstContent]?.heading?.level === 1 ? firstContent : -1;
	const retained = lines.filter((_line, index) => index !== titleIndex);
	// Every retained heading belongs inside the generated level-three View.
	const shift = retained.some((line) => line.heading?.level === 1) ? 3 : 2;
	const body = retained.map((line) => line.heading
		? `${line.heading.indent}${"#".repeat(Math.min(6, line.heading.level + shift))} ${line.heading.content}`
		: line.text).join("\n").trim();
	return body || undefined;
}

/** Rewrite only template navigation matching the declared group; omit it in a perspective. */
export function rewriteManagedCardNavigation(markdown: string, oldPath?: string, newPath?: string): string {
	if (!oldPath || (newPath && normalizeLinkedMarkdownPath(oldPath) === normalizeLinkedMarkdownPath(newPath))) return markdown;
	const { frontmatter, lines } = inspectBodyLines(markdown);
	let inReviewCards = false;
	return frontmatter + lines.map((line) => {
		if (line.heading) inReviewCards = !line.heading.indent && line.heading.level === 2 && line.heading.title.toLowerCase() === "review cards";
		const match = inReviewCards && !line.literal
			? /^( {0,3}Cards:[ \t]*)(\[\[[^\]]+\]\])([ \t]*)$/.exec(line.text) : null;
		const link = match?.[2];
		if (!match || !link || normalizeLinkedMarkdownPath(link) !== normalizeLinkedMarkdownPath(oldPath)) return line.text + line.ending;
		if (!newPath) return line.ending;
		const aliasStart = link.indexOf("|");
		const alias = aliasStart < 0 ? "" : link.slice(aliasStart, -2);
		const replacement = toObsidianInternalLink(newPath).slice(0, -2) + alias + "]]";
		return `${match[1]}${replacement}${match[3]}${line.ending}`;
	}).join("");
}

export function normalizeLinkedMarkdownPath(value: string): string {
	const linkMatch = /^\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(value);
	const path = (linkMatch?.[1] ?? value).trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
	return /\.md$/i.test(path) ? path : `${path}.md`;
}

/** Inspect top-level ATX headings without treating fenced examples as structure. */
function inspectBodyLines(markdown: string): { frontmatter: string; lines: BodyLine[] } {
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown)?.[0] ?? "";
	const parts = markdown.slice(frontmatter.length).split(/(\r?\n)/);
	const lines: BodyLine[] = [];
	let fence: { character: string; length: number } | undefined;
	let inComment = false;
	for (let index = 0; index < parts.length; index += 2) {
		const text = parts[index] ?? "";
		const line: BodyLine = { text, ending: parts[index + 1] ?? "", literal: false };
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
		if (fence) {
			line.literal = true;
			if (marker?.[1]?.[0] === fence.character
				&& marker[1].length >= fence.length && !marker[2]?.trim()) fence = undefined;
		} else if (!inComment && marker?.[1] && !(marker[1][0] === "`" && marker[2]?.includes("`"))) {
			line.literal = true;
			fence = { character: marker[1][0]!, length: marker[1].length };
		} else {
			line.literal = inComment || /^\s*<!--/.test(text);
			inComment = advanceCommentState(text, inComment);
			const heading = line.literal ? null : /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(text);
			if (heading?.[2]) {
				const content = heading[3] ?? "";
				line.heading = { indent: heading[1] ?? "", level: heading[2].length, content, title: content.replace(/[ \t]+#+[ \t]*$/, "").trim() };
			}
		}
		lines.push(line);
	}
	return { frontmatter, lines };
}

function advanceCommentState(text: string, inComment: boolean): boolean {
	for (let index = 0; index < text.length;) {
		if (inComment) {
			const end = text.indexOf("-->", index);
			if (end < 0) return true;
			inComment = false;
			index = end + 3;
		} else if (text[index] === "\\") {
			index += 2;
		} else if (text[index] === "`") {
			let end = index + 1;
			while (text[end] === "`") end += 1;
			const run = text.slice(index, end);
			index = end;
			for (const closing of text.slice(index).matchAll(/`+/g)) {
				if (closing[0] !== run) continue;
				index += closing.index! + run.length;
				break;
			}
		} else if (text.startsWith("<!--", index)) {
			inComment = true;
			index += 4;
		} else {
			index += 1;
		}
	}
	return inComment;
}
