export interface ConceptViewAppendInput {
	body: string;
	title: string;
}

export interface ConceptViewAppendResult {
	markdown: string;
	status: "appended" | "unchanged";
}

export function appendConceptView(
	markdown: string,
	view: ConceptViewAppendInput,
): ConceptViewAppendResult {
	const title = view.title.trim();
	const body = view.body.trim();

	if (!title || !body) {
		throw new Error("Concept view title and body are required.");
	}

	const lines = markdown.split(/\r?\n/);
	const viewsStart = findHeading(lines, 2, "Views");

	if (viewsStart === -1) {
		return {
			markdown: `${markdown.trimEnd()}\n\n## Views\n\n### ${title}\n\n${body}\n`,
			status: "appended",
		};
	}

	const viewsEnd = findSectionEnd(lines, viewsStart + 1, 2);
	const existingView = findView(lines, viewsStart + 1, viewsEnd, title);

	if (existingView) {
		const existingBody = lines
			.slice(existingView.start + 1, existingView.end)
			.join("\n")
			.trim();

		if (existingBody === body) {
			return { markdown, status: "unchanged" };
		}

		throw new Error(`Concept view already exists with different content: ${title}`);
	}

	const before = lines.slice(0, viewsEnd).join("\n").trimEnd();
	const after = lines.slice(viewsEnd).join("\n").trimStart();
	const appended = `${before}\n\n### ${title}\n\n${body}\n`;

	return {
		markdown: after ? `${appended}\n${after}` : appended,
		status: "appended",
	};
}

function findHeading(lines: string[], level: number, title: string): number {
	let fence: string | undefined;
	const headingPattern = new RegExp(`^#{${level}}\\s+${escapeRegExp(title)}\\s*$`, "i");

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];

		if (line === undefined) {
			continue;
		}

		fence = updateFence(fence, line);

		if (!fence && headingPattern.test(line.trim())) {
			return index;
		}
	}

	return -1;
}

function findSectionEnd(lines: string[], start: number, maxLevel: number): number {
	let fence: string | undefined;

	for (let index = start; index < lines.length; index += 1) {
		const line = lines[index];

		if (line === undefined) {
			continue;
		}

		fence = updateFence(fence, line);

		if (!fence) {
			const match = line.match(/^(#{1,6})\s+/);

			if (match?.[1] && match[1].length <= maxLevel) {
				return index;
			}
		}
	}

	return lines.length;
}

function findView(
	lines: string[],
	start: number,
	end: number,
	title: string,
): { end: number; start: number } | undefined {
	let fence: string | undefined;
	const normalizedTitle = title.toLocaleLowerCase();

	for (let index = start; index < end; index += 1) {
		const line = lines[index];

		if (line === undefined) {
			continue;
		}

		fence = updateFence(fence, line);

		if (fence) {
			continue;
		}

		const match = line.match(/^###\s+(.+?)\s*$/);

		if (!match?.[1] || match[1].trim().toLocaleLowerCase() !== normalizedTitle) {
			continue;
		}

		return {
			end: findSectionEnd(lines.slice(0, end), index + 1, 3),
			start: index,
		};
	}

	return undefined;
}

function updateFence(currentFence: string | undefined, line: string): string | undefined {
	const match = line.trim().match(/^(```+|~~~+)/);

	if (!match) {
		return currentFence;
	}

	const marker = match[1]?.[0];

	if (!marker) {
		return currentFence;
	}

	if (!currentFence) {
		return marker;
	}

	return currentFence === marker ? undefined : currentFence;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
