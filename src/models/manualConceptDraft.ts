import type { ConceptImportance, ConceptLearningMode } from "./conceptLibrary";

export interface ManualConceptDraft {
	/** Optional only for drafts persisted before durable creation. */
	draftId?: string;
	coreMeaning: string;
	englishName: string;
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
	draftId = globalThis.crypto.randomUUID(),
): ManualConceptDraft {
	return {
		draftId,
		coreMeaning: "",
		englishName: "",
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
		|| draft.englishName.trim()
		|| draft.coreMeaning.trim()
		|| draft.whyItMatters.trim()
		|| draft.sourcePath?.trim()
		|| draft.tags.some((tag) => tag.trim())
		|| draft.learningMode !== "reviewable"
		|| draft.importance !== "normal"
	);
}
