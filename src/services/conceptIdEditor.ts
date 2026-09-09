export interface AssignConceptIdInput {
	expectedConceptId?: string;
	newConceptId: string;
}

export type AssignConceptIdResult =
	| { markdown: string; status: "updated" }
	| { message: string; status: "conflict" | "invalid" };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;

export function createStableConceptId(
	now = Date.now(),
	randomValue = Math.random(),
): string {
	const time = Math.max(0, Math.floor(now)).toString(36);
	const random = Math.floor(Math.max(0, Math.min(randomValue, 0.999999999999)) * 0x100000000)
		.toString(36)
		.padStart(7, "0");

	return `concept_${time}_${random}`;
}

export function assignConceptId(markdown: string, input: AssignConceptIdInput): AssignConceptIdResult {
	return updateFrontmatterIdentity(markdown, {
		expectedId: input.expectedConceptId,
		idKey: "mneme_id",
		newId: input.newConceptId,
		type: "concept",
	});
}

export function assignCardGroupConceptId(
	markdown: string,
	input: AssignConceptIdInput,
): AssignConceptIdResult {
	return updateFrontmatterIdentity(markdown, {
		expectedId: input.expectedConceptId,
		idKey: "mneme_concept_id",
		newId: input.newConceptId,
		type: "card_group",
	});
}

export function getCardGroupConceptId(markdown: string): string | undefined {
	const frontmatterMatch = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
	if (!frontmatterMatch) {
		return undefined;
	}

	const body = frontmatterMatch[2] ?? "";
	const types = collectScalarLines(body, "mneme_type");
	const ids = collectScalarLines(body, "mneme_concept_id");

	return types.length === 1 && types[0]?.value === "card_group" && ids.length === 1 && !ids[0]?.invalid
		? ids[0]?.value || undefined
		: undefined;
}

interface UpdateFrontmatterIdentityInput {
	expectedId?: string;
	idKey: "mneme_id" | "mneme_concept_id";
	newId: string;
	type: "concept" | "card_group";
}

function updateFrontmatterIdentity(
	markdown: string,
	input: UpdateFrontmatterIdentityInput,
): AssignConceptIdResult {
	const newId = input.newId.trim();
	if (!ID_PATTERN.test(newId)) {
		return {
			message: "Concept ID must be 3-128 characters using letters, numbers, underscores, or hyphens.",
			status: "invalid",
		};
	}

	const frontmatterMatch = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
	if (!frontmatterMatch) {
		return { message: "A YAML frontmatter block is required.", status: "invalid" };
	}

	const body = frontmatterMatch[2] ?? "";
	const typeMatches = collectScalarLines(body, "mneme_type");
	const typeMatch = typeMatches[0];
	if (typeMatches.length !== 1 || !typeMatch || typeMatch.invalid || typeMatch.value !== input.type) {
		return { message: `Expected mneme_type: ${input.type}.`, status: "invalid" };
	}

	const idMatches = collectScalarLines(body, input.idKey);
	if (idMatches.length > 1 || idMatches.some((match) => match.invalid)) {
		return { message: `${input.idKey} must be a single plain or quoted scalar.`, status: "invalid" };
	}

	const currentId = idMatches[0]?.value || undefined;
	if (currentId !== input.expectedId) {
		return { message: "Concept identity changed after the repair view opened.", status: "conflict" };
	}

	let nextBody: string;
	if (idMatches[0]) {
		const match = idMatches[0];
		const separator = /[ \t]$/.test(match.prefix) ? "" : " ";
		const commentSeparator = body[match.valueEnd] === "#" ? " " : "";
		nextBody = `${body.slice(0, match.valueStart)}${separator}${match.quote}${newId}${match.quote}${commentSeparator}${body.slice(match.valueEnd)}`;
	} else {
		const newline = markdown.startsWith("---\r\n") ? "\r\n" : "\n";
		nextBody = `${body.slice(0, typeMatch.end)}${newline}${input.idKey}: ${newId}${body.slice(typeMatch.end)}`;
	}

	const frontmatterStart = frontmatterMatch[1] ?? "";
	const frontmatterEnd = frontmatterMatch[3] ?? "";
	const fullFrontmatter = frontmatterMatch[0] ?? "";
	return {
		markdown: `${frontmatterStart}${nextBody}${frontmatterEnd}${markdown.slice(fullFrontmatter.length)}`,
		status: "updated",
	};
}

interface ScalarLine {
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
function collectScalarLines(body: string, key: string): ScalarLine[] {
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
