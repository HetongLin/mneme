import type { ConceptImportance, ConceptLearningMode } from "./conceptLibrary";

export interface ManualConceptDraft {
	coreMeaning: string;
	importance: ConceptImportance;
	learningMode: ConceptLearningMode;
	sourcePath?: string;
	tags: string[];
	title: string;
	updatedAt: string;
	whyItMatters: string;
}

export function createEmptyManualConceptDraft(
	sourcePath?: string,
	updatedAt = new Date().toISOString(),
): ManualConceptDraft {
	return {
		coreMeaning: "",
		importance: "normal",
		learningMode: "reviewable",
		...(sourcePath ? { sourcePath } : {}),
		tags: [],
		title: "",
		updatedAt,
		whyItMatters: "",
	};
}

export function isMeaningfulManualConceptDraft(draft: ManualConceptDraft): boolean {
	return !!(
		draft.title.trim()
		|| draft.coreMeaning.trim()
		|| draft.whyItMatters.trim()
		|| draft.sourcePath?.trim()
		|| draft.tags.some((tag) => tag.trim())
		|| draft.learningMode !== "reviewable"
		|| draft.importance !== "normal"
	);
}
