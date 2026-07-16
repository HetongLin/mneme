import { normalizeVaultPath } from "../utils/markdownPath";

export type CurrentNoteKind =
	| "none"
	| "non_markdown"
	| "source_note"
	| "reviewable_concept"
	| "exploratory_concept"
	| "mneme_internal";

export interface CurrentNoteContext {
	conceptsFolder: string;
	extension?: string;
	hasConceptId?: boolean;
	learningMode?: unknown;
	path?: string;
	cardsFolder: string;
}

export function classifyCurrentNote(context: CurrentNoteContext): CurrentNoteKind {
	if (!context.path) return "none";
	if (context.extension?.toLocaleLowerCase() !== "md") return "non_markdown";

	if (context.hasConceptId) {
		return context.learningMode === "exploratory"
			? "exploratory_concept"
			: "reviewable_concept";
	}

	if (
		isPathInsideFolder(context.path, context.conceptsFolder)
		|| isPathInsideFolder(context.path, context.cardsFolder)
	) {
		return "mneme_internal";
	}

	return "source_note";
}

export function canAnalyzeCurrentNote(kind: CurrentNoteKind): boolean {
	return kind === "source_note";
}

export function canGenerateCardsFromCurrentConcept(kind: CurrentNoteKind): boolean {
	return kind === "reviewable_concept";
}

export function canOpenCardsForCurrentConcept(kind: CurrentNoteKind): boolean {
	return kind === "reviewable_concept" || kind === "exploratory_concept";
}

export function isPathInsideFolder(path: string, folder: string): boolean {
	const normalizedPath = normalizeVaultPath(path).toLocaleLowerCase();
	const normalizedFolder = normalizeVaultPath(folder).replace(/\/$/u, "").toLocaleLowerCase();

	return !!normalizedFolder
		&& (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`));
}
