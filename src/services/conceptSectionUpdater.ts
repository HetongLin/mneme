export interface ConceptSectionUpdate {
	coreMeaning?: string;
	whyItMatters?: string;
}

export interface ConceptSectionUpdateResult {
	markdown: string;
	status: "unchanged" | "updated";
}

export function updateConceptSections(
	markdown: string,
	update: ConceptSectionUpdate,
): ConceptSectionUpdateResult {
	const coreMeaning = normalizeOptionalContent(update.coreMeaning);
	const whyItMatters = normalizeOptionalContent(update.whyItMatters);

	if (!coreMeaning && !whyItMatters) {
		throw new Error("At least one Concept section update is required.");
	}

	let result = markdown;
	let changed = false;

	if (coreMeaning) {
		const sectionResult = replaceLevelTwoSection(
			result,
			"Core Meaning",
			coreMeaning,
			["Why It Matters", "Views"],
		);
		result = sectionResult.markdown;
		changed ||= sectionResult.changed;
	}

	if (whyItMatters) {
		const sectionResult = replaceLevelTwoSection(
			result,
			"Why It Matters",
			whyItMatters,
			["Views", "Common Traps"],
		);
		result = sectionResult.markdown;
		changed ||= sectionResult.changed;
	}

	return {
		markdown: result,
		status: changed ? "updated" : "unchanged",
	};
}

function replaceLevelTwoSection(
	markdown: string,
	heading: string,
	content: string,
	insertBeforeHeadings: string[],
): { changed: boolean; markdown: string } {
	const lines = markdown.split(/\r?\n/);
	const start = findLevelTwoHeading(lines, heading);

	if (start === -1) {
		const anchor = insertBeforeHeadings
			.map((candidate) => findLevelTwoHeading(lines, candidate))
			.find((index) => index >= 0);

		if (anchor !== undefined) {
			const before = trimTrailingBlankLines(lines.slice(0, anchor));
			const after = lines.slice(anchor);

			return {
				changed: true,
				markdown: `${[
					...before,
					"",
					`## ${heading}`,
					"",
					...content.split("\n"),
					"",
					...after,
				].join("\n").trimEnd()}\n`,
			};
		}

		return {
			changed: true,
			markdown: `${markdown.trimEnd()}\n\n## ${heading}\n\n${content}\n`,
		};
	}

	const end = findSectionEnd(lines, start + 1);
	const existing = lines.slice(start + 1, end).join("\n").trim();

	if (existing === content) {
		return { changed: false, markdown };
	}

	const before = lines.slice(0, start + 1);
	const after = trimLeadingBlankLines(lines.slice(end));
	const combined = [...before, "", ...content.split("\n"), "", ...after];

	return {
		changed: true,
		markdown: `${combined.join("\n").trimEnd()}\n`,
	};
}

function findLevelTwoHeading(lines: string[], heading: string): number {
	let fence: string | undefined;
	const normalizedHeading = heading.toLocaleLowerCase();

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		fence = updateFence(fence, line);

		if (!fence) {
			const match = line.match(/^##\s+(.+?)\s*#*\s*$/);

			if (match?.[1]?.trim().toLocaleLowerCase() === normalizedHeading) {
				return index;
			}
		}
	}

	return -1;
}

function findSectionEnd(lines: string[], start: number): number {
	let fence: string | undefined;

	for (let index = start; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		fence = updateFence(fence, line);

		if (!fence && /^#{1,2}\s+/.test(line)) {
			return index;
		}
	}

	return lines.length;
}

function updateFence(currentFence: string | undefined, line: string): string | undefined {
	const marker = line.trim().match(/^(```+|~~~+)/)?.[1]?.[0];

	if (!marker) {
		return currentFence;
	}

	if (!currentFence) {
		return marker;
	}

	return currentFence === marker ? undefined : currentFence;
}

function normalizeOptionalContent(value: string | undefined): string | undefined {
	const normalized = value?.trim();

	return normalized ? normalized : undefined;
}

function trimLeadingBlankLines(lines: string[]): string[] {
	const result = [...lines];

	while (result[0]?.trim() === "") {
		result.shift();
	}

	return result;
}

function trimTrailingBlankLines(lines: string[]): string[] {
	const result = [...lines];

	while (result[result.length - 1]?.trim() === "") {
		result.pop();
	}

	return result;
}
