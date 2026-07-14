export interface SourceCaptureChunk {
	content: string;
	end: number;
	index: number;
	start: number;
	total: number;
	totalChars: number;
}

interface MarkdownBoundaries {
	headings: number[];
	paragraphs: number[];
}

export function splitSourceForAiCapture(content: string, maxChars: number): SourceCaptureChunk[] {
	if (!Number.isInteger(maxChars) || maxChars < 1) {
		throw new Error("AI chunk size must be a positive integer.");
	}
	if (content.length === 0) return [];

	const boundaries = collectMarkdownBoundaries(content);
	const ranges: Array<{ end: number; start: number }> = [];
	let start = 0;

	while (start < content.length) {
		const hardEnd = Math.min(content.length, start + maxChars);
		let end = hardEnd;

		if (hardEnd < content.length) {
			const minimumPreferredEnd = start + Math.max(1, Math.floor(maxChars / 2));
			end = findLastBoundary(boundaries.headings, minimumPreferredEnd, hardEnd)
				?? findLastBoundary(boundaries.paragraphs, minimumPreferredEnd, hardEnd)
				?? hardEnd;
			end = avoidBrokenTextBoundary(content, start, end);
		}

		if (end <= start) end = hardEnd;
		ranges.push({ end, start });
		start = end;
	}

	return ranges.map((range, index) => ({
		content: content.slice(range.start, range.end),
		end: range.end,
		index: index + 1,
		start: range.start,
		total: ranges.length,
		totalChars: content.length,
	}));
}

function collectMarkdownBoundaries(content: string): MarkdownBoundaries {
	const headings: number[] = [];
	const paragraphs: number[] = [];
	const lines = content.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) ?? [];
	let offset = 0;
	let previousLineBlank = false;
	let fenceMarker: "```" | "~~~" | undefined;

	for (const rawLine of lines) {
		if (rawLine.length === 0) continue;
		const line = rawLine.replace(/(?:\r\n|\r|\n)$/u, "");
		const trimmed = line.trim();
		const marker = trimmed.startsWith("```") ? "```" : trimmed.startsWith("~~~") ? "~~~" : undefined;

		if (!fenceMarker && marker) {
			fenceMarker = marker;
		} else if (fenceMarker && marker === fenceMarker) {
			fenceMarker = undefined;
		} else if (!fenceMarker) {
			if (/^#{1,6}\s+\S/u.test(line)) headings.push(offset);
			if (previousLineBlank && trimmed.length > 0) paragraphs.push(offset);
		}

		previousLineBlank = !fenceMarker && trimmed.length === 0;
		offset += rawLine.length;
	}

	return { headings, paragraphs };
}

function findLastBoundary(boundaries: number[], minimum: number, maximum: number): number | undefined {
	for (let index = boundaries.length - 1; index >= 0; index -= 1) {
		const boundary = boundaries[index]!;
		if (boundary > maximum) continue;
		return boundary >= minimum ? boundary : undefined;
	}

	return undefined;
}

function avoidBrokenTextBoundary(content: string, start: number, end: number): number {
	let safeEnd = end;
	if (content[safeEnd - 1] === "\r" && content[safeEnd] === "\n") safeEnd -= 1;

	const previousCodeUnit = content.charCodeAt(safeEnd - 1);
	const nextCodeUnit = content.charCodeAt(safeEnd);
	if (
		safeEnd > start
		&& previousCodeUnit >= 0xD800
		&& previousCodeUnit <= 0xDBFF
		&& nextCodeUnit >= 0xDC00
		&& nextCodeUnit <= 0xDFFF
	) {
		safeEnd -= 1;
	}

	return safeEnd;
}
