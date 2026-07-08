import { normalizeVaultPath } from "../utils/markdownPath";

export type RemoveConceptSourceResult =
	| { markdown: string; removals: number; status: "removed" }
	| { markdown: string; removals: 0; status: "not_found" };

export function removeConceptSourceEntry(markdown: string, sourcePath: string): RemoveConceptSourceResult {
	const target = comparablePath(sourcePath);
	if (!target) throw new Error("Source path is required.");
	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	const lines = markdown.split(/\r?\n/);
	const start = findHeading(lines, "Source Notes");
	if (start < 0) return { markdown, removals: 0, status: "not_found" };
	const end = findNextHeading(lines, start + 1);
	const removeIndexes = new Set<number>();
	let removals = 0;
	for (let index = start + 1; index < end; index += 1) {
		const entry = lines[index]?.match(/^\s*>\s*-\s+\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
		if (!entry?.[1] || comparablePath(entry[1]) !== target) continue;
		removals += 1;
		removeIndexes.add(index);
		for (let child = index + 1; child < end && /^\s*>\s{2,}-\s+/.test(lines[child] ?? ""); child += 1) {
			removeIndexes.add(child);
		}
	}
	if (removals === 0) return { markdown, removals: 0, status: "not_found" };
	return {
		markdown: lines.filter((_, index) => !removeIndexes.has(index)).join(newline),
		removals,
		status: "removed",
	};
}

function comparablePath(path: string): string {
	return normalizeVaultPath(path).replace(/\.md$/i, "").toLocaleLowerCase();
}

function findHeading(lines: string[], title: string): number {
	let fence: string | undefined;
	for (let index = 0; index < lines.length; index += 1) {
		fence = updateFence(fence, lines[index] ?? "");
		if (!fence && lines[index]?.trim().toLocaleLowerCase() === `## ${title.toLocaleLowerCase()}`) return index;
	}
	return -1;
}

function findNextHeading(lines: string[], start: number): number {
	let fence: string | undefined;
	for (let index = start; index < lines.length; index += 1) {
		fence = updateFence(fence, lines[index] ?? "");
		if (!fence && /^#{1,2}\s+/.test(lines[index] ?? "")) return index;
	}
	return lines.length;
}

function updateFence(current: string | undefined, line: string): string | undefined {
	const marker = line.trim().match(/^(```+|~~~+)/)?.[1]?.[0];
	if (!marker) return current;
	if (!current) return marker;
	return current === marker ? undefined : current;
}
