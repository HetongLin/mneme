export interface MarkdownLine {
	text: string;
	ending: string;
	literal: boolean;
	/** Same UTF-16 offsets as text; code, comments and escapes are masked with spaces. */
	activeText: string;
	heading?: { indent: string; level: number; content: string; title: string };
}

/** Scoped ATX/fence/comment inspection, shared by deterministic Markdown edits. */
export function inspectMarkdownLines(markdown: string): {
	frontmatter: string;
	lines: MarkdownLine[];
	openLiteral: boolean;
} {
	const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown)?.[0] ?? "";
	const parts = markdown.slice(frontmatter.length).split(/(\r?\n)/);
	const lines: MarkdownLine[] = [];
	let fence: { character: string; length: number } | undefined;
	let inComment = false;
	for (let index = 0; index < parts.length; index += 2) {
		const text = parts[index] ?? "";
		const line: MarkdownLine = { text, ending: parts[index + 1] ?? "", literal: false, activeText: " ".repeat(text.length) };
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
		if (fence) {
			line.literal = true;
			if (marker?.[1]?.[0] === fence.character
				&& marker[1].length >= fence.length && !marker[2]?.trim()) fence = undefined;
		} else if (!inComment && marker?.[1] && !(marker[1][0] === "`" && marker[2]?.includes("`"))) {
			line.literal = true;
			fence = { character: marker[1][0]!, length: marker[1].length };
		} else if (!inComment && /^(?: {4}|\t)/.test(text)) {
			line.literal = true;
		} else {
			line.literal = inComment || /^\s*<!--/.test(text);
			const scanned = scanInlineLiterals(text, inComment);
			inComment = scanned.inComment;
			line.activeText = scanned.activeText;
			const heading = line.literal ? null : /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(text);
			if (heading?.[2]) {
				const content = heading[3] ?? "";
				line.heading = { indent: heading[1] ?? "", level: heading[2].length, content, title: content.replace(/[ \t]+#+[ \t]*$/, "").trim() };
			}
		}
		lines.push(line);
	}
	return { frontmatter, lines, openLiteral: !!fence || inComment };
}

function scanInlineLiterals(text: string, inComment: boolean): { activeText: string; inComment: boolean } {
	const active = text.split("");
	const mask = (start: number, end: number): void => { for (let i = start; i < end; i += 1) active[i] = " "; };
	for (let index = 0; index < text.length;) {
		if (inComment) {
			const end = text.indexOf("-->", index);
			mask(index, end < 0 ? text.length : end + 3);
			if (end < 0) break;
			inComment = false;
			index = end + 3;
		} else if (text[index] === "\\") {
			mask(index, Math.min(index + 2, text.length));
			index += 2;
		} else if (text[index] === "`") {
			const start = index;
			let end = index + 1;
			while (text[end] === "`") end += 1;
			const run = text.slice(index, end);
			index = end;
			for (const closing of text.slice(index).matchAll(/`+/g)) {
				if (closing[0] !== run) continue;
				index += closing.index! + run.length;
				mask(start, index);
				break;
			}
		} else if (text.startsWith("<!--", index)) {
			inComment = true;
			mask(index, index + 4);
			index += 4;
		} else {
			index += 1;
		}
	}
	return { activeText: active.join(""), inComment };
}
