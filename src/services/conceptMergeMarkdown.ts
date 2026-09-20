import { inspectMarkdownLines } from "./markdownLineInspector";
import { toObsidianInternalLink } from "../utils/markdownPath";
import { getCardGroupPathFromConceptFrontmatter } from "./conceptMarkdownIdentity";
import { parseRelatedConceptLinks, removeRelatedConceptLink } from "./conceptRelatedLinks";
import { readMarkdownScalar } from "./markdownScalar";

export function extractMergedPerspective(markdown: string): string | undefined {
	for (const link of parseRelatedConceptLinks(markdown)) {
		markdown = removeRelatedConceptLink(markdown, link.target).markdown;
	}
	const cardsPath = getCardGroupPathFromConceptFrontmatter({
		mneme_type: "concept",
		cards: readMarkdownScalar(markdown, "cards"),
		cards_folder: readMarkdownScalar(markdown, "cards_folder"),
	});
	const { lines } = inspectMarkdownLines(rewriteManagedCardNavigation(markdown, cardsPath));
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
	const { frontmatter, lines } = inspectMarkdownLines(markdown);
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
