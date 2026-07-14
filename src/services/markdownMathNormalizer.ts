interface MarkdownFence {
	character: "`" | "~";
	length: number;
}

/**
 * Removes spaces immediately inside single-dollar inline math delimiters.
 * Display math, escaped dollars, inline code, and fenced code remain untouched.
 */
export function normalizeInlineMathDelimiterSpacing(markdown: string): string {
	const parts = markdown.split(/(\r\n|\n|\r)/u);
	let fence: MarkdownFence | undefined;

	return parts.map((part) => {
		if (part === "\n" || part === "\r" || part === "\r\n") return part;

		const fenceRun = readFenceRun(part);
		if (fence) {
			if (
				fenceRun
				&& fenceRun.character === fence.character
				&& fenceRun.length >= fence.length
				&& part.slice(fenceRun.end).trim() === ""
			) {
				fence = undefined;
			}
			return part;
		}

		if (fenceRun) {
			fence = { character: fenceRun.character, length: fenceRun.length };
			return part;
		}

		return normalizeLine(part);
	}).join("");
}

function normalizeLine(line: string): string {
	let normalized = "";
	let index = 0;

	while (index < line.length) {
		if (line[index] === "`") {
			const runLength = countRun(line, index, "`");
			const closingIndex = findExactBacktickRun(line, index + runLength, runLength);
			if (closingIndex < 0) return normalized + line.slice(index);

			const end = closingIndex + runLength;
			normalized += line.slice(index, end);
			index = end;
			continue;
		}

		if (isSingleUnescapedDollar(line, index)) {
			const closingIndex = findClosingInlineMathDollar(line, index + 1);
			if (closingIndex >= 0) {
				const content = line.slice(index + 1, closingIndex);
				const trimmedContent = content.replace(/^[ \t]+|[ \t]+$/gu, "");
				if (trimmedContent && isLikelyMathContent(trimmedContent)) {
					normalized += `$${trimmedContent}$`;
					index = closingIndex + 1;
					continue;
				}
			}
		}

		normalized += line[index];
		index += 1;
	}

	return normalized;
}

function isLikelyMathContent(content: string): boolean {
	if (/[\\=+\-*/^_<>|()[\]{}]|[≤≥≠≈∞∑∫√]/u.test(content)) return true;

	const tokens = content.split(/[ \t]+/u);
	return tokens.every((token) => (
		/^[A-Za-z]$/u.test(token)
		|| /^[A-Z]{2,4}$/u.test(token)
		|| /^\d+(?:\.\d+)?$/u.test(token)
		|| /^(?:sin|cos|tan|log|ln|exp|max|min|lim)$/u.test(token)
		|| Array.from(token).length === 1
	));
}

function findClosingInlineMathDollar(line: string, start: number): number {
	for (let index = start; index < line.length; index += 1) {
		if (isSingleUnescapedDollar(line, index)) return index;
	}

	return -1;
}

function isSingleUnescapedDollar(value: string, index: number): boolean {
	return value[index] === "$"
		&& value[index - 1] !== "$"
		&& value[index + 1] !== "$"
		&& !isEscaped(value, index);
}

function isEscaped(value: string, index: number): boolean {
	let backslashCount = 0;
	for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
		backslashCount += 1;
	}

	return backslashCount % 2 === 1;
}

function findExactBacktickRun(value: string, start: number, runLength: number): number {
	for (let index = start; index < value.length; index += 1) {
		if (value[index] !== "`") continue;
		const candidateLength = countRun(value, index, "`");
		if (candidateLength === runLength) return index;
		index += candidateLength - 1;
	}

	return -1;
}

function countRun(value: string, start: number, character: "`" | "~"): number {
	let end = start;
	while (value[end] === character) end += 1;
	return end - start;
}

function readFenceRun(line: string): (MarkdownFence & { end: number }) | undefined {
	let start = 0;
	while (start < 3 && line[start] === " ") start += 1;
	const character = line[start];
	if (character !== "`" && character !== "~") return undefined;

	const length = countRun(line, start, character);
	if (length < 3) return undefined;

	return { character, end: start + length, length };
}
