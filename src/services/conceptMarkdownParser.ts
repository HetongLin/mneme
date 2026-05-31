const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;
const MAX_PREVIEW_LENGTH = 220;

export function stripFrontmatter(markdown: string): string {
	try {
		return markdown.replace(FRONTMATTER_PATTERN, "");
	} catch {
		return markdown;
	}
}

export function parseConceptTitle(markdown: string, fallbackPath: string): string {
	const body = stripFrontmatter(markdown);
	const titleMatch = body.match(/^#\s+(.+?)\s*#*\s*$/m);
	const title = titleMatch?.[1]?.trim();

	return title || titleFromPath(fallbackPath);
}

export function extractSection(markdown: string, heading: string): string | undefined {
	const lines = stripFrontmatter(markdown).split(/\r?\n/);
	const targetHeading = normalizeHeading(heading);
	let headingLevel: number | undefined;
	let sectionStart = -1;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const parsedHeading = parseHeadingLine(line);

		if (!parsedHeading) {
			continue;
		}

		if (normalizeHeading(parsedHeading.text) === targetHeading) {
			headingLevel = parsedHeading.level;
			sectionStart = index + 1;
			break;
		}
	}

	if (sectionStart < 0 || headingLevel === undefined) {
		return undefined;
	}

	const sectionLines: string[] = [];

	for (let index = sectionStart; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const parsedHeading = parseHeadingLine(line);

		if (parsedHeading && parsedHeading.level <= headingLevel) {
			break;
		}

		sectionLines.push(line);
	}

	const section = sectionLines.join("\n").trim();

	return section.length > 0 ? section : undefined;
}

export function extractCoreMeaning(markdown: string): string | undefined {
	return extractSection(markdown, "Core Meaning");
}

export function extractWhyItMatters(markdown: string): string | undefined {
	return extractSection(markdown, "Why It Matters");
}

export function createConceptPreview(markdown: string): string {
	const preferred = extractCoreMeaning(markdown) ?? firstBodyParagraph(markdown) ?? "";

	return truncate(cleanPreviewText(preferred), MAX_PREVIEW_LENGTH);
}

function firstBodyParagraph(markdown: string): string | undefined {
	const body = stripFrontmatter(markdown);
	const lines = body.split(/\r?\n/);
	const paragraph: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			if (paragraph.length > 0) {
				break;
			}
			continue;
		}

		if (parseHeadingLine(trimmed)) {
			continue;
		}

		paragraph.push(trimmed);
	}

	return paragraph.length > 0 ? paragraph.join(" ") : undefined;
}

function parseHeadingLine(line: string): { level: number; text: string } | undefined {
	const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);

	if (!match) {
		return undefined;
	}

	return {
		level: (match[1] ?? "").length,
		text: (match[2] ?? "").trim(),
	};
}

function normalizeHeading(heading: string): string {
	return heading.trim().toLowerCase();
}

function cleanPreviewText(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/[#>*_`[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength - 1).trim()}...`;
}

function titleFromPath(path: string): string {
	const parts = path.split("/").filter((part) => part.length > 0);
	const basename = parts[parts.length - 1] ?? "Untitled";
	const withoutExtension = basename.replace(/\.md$/i, "");
	const fallback = withoutExtension.toLowerCase() === "concept" && parts.length > 1
		? parts[parts.length - 2] ?? withoutExtension
		: withoutExtension;

	return fallback.replace(/[-_]+/g, " ").trim() || "Untitled";
}
