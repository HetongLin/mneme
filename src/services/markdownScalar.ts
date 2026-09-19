/** Read one unambiguous scalar from the leading YAML block, never from the body. */
export function readMarkdownScalar(markdown: string, key: string): string | undefined {
	const block = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
	if (!block) throw new Error("A YAML frontmatter block is required.");
	const matches = collectScalarLines(block[2] ?? "", key);
	if (matches.length > 1 || matches.some((match) => match.invalid)) {
		throw new Error(`${key} must be a single plain or quoted scalar.`);
	}
	return matches[0]?.value || undefined;
}

export interface ScalarLine {
	end: number;
	start: number;
	value: string;
	valueStart: number;
	valueEnd: number;
	prefix: string;
	quote: string;
	invalid: boolean;
}

/** Horizontal whitespace only: an empty YAML scalar must not consume the next line. */
export function collectScalarLines(body: string, key: string): ScalarLine[] {
	const pattern = new RegExp(`^(?:${key}|"${key}"|'${key}')([ \t]*:[ \t]*)([^\r\n]*)(?=\r?$)`, "gm");
	return Array.from(body.matchAll(pattern), (match) => {
		const raw = match[2] ?? "";
		const start = match.index ?? 0;
		const fullMatch = match[0] ?? "";
		const prefix = fullMatch.slice(0, fullMatch.length - raw.length);
		const valueStart = start + prefix.length;
		const scalar = parseScalar(raw);
		return {
			start, end: start + fullMatch.length, prefix, valueStart,
			valueEnd: valueStart + scalar.length,
			value: scalar.value, quote: scalar.quote, invalid: scalar.invalid,
		};
	});
}

function parseScalar(raw: string): { value: string; quote: string; length: number; invalid: boolean } {
	const quote = raw[0] === "'" || raw[0] === '"' ? raw[0] : "";
	if (quote) {
		const quoted = quote === "'" ? /^'(?:[^']|'')*'/.exec(raw) : /^"(?:[^"\\]|\\.)*"/.exec(raw);
		const token = quoted?.[0];
		if (!token || !/^(?:[ \t]+#.*|[ \t]*)$/.test(raw.slice(token.length))) {
			return { value: "", quote, length: raw.length, invalid: true };
		}
		try {
			const value: string = quote === "'" ? token.slice(1, -1).replace(/''/g, "'") : JSON.parse(token);
			return { value, quote, length: token.length, invalid: false };
		} catch {
			return { value: "", quote, length: raw.length, invalid: true };
		}
	}
	const comment = raw.startsWith("#") ? 0 : raw.search(/[ \t]+#/);
	const value = (comment < 0 ? raw : raw.slice(0, comment)).trimEnd();
	return {
		value, quote: "", length: value.length,
		invalid: /^[\[\]{}>|*&!%@`]/.test(value) || /:[ \t]/.test(value),
	};
}
