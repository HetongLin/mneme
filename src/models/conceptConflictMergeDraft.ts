import type {
	ConceptImportance,
	ConceptLearningMode,
} from "./conceptLibrary";

export interface ConceptConflictMergeDraftRecord {
	draft: {
		coreMeaning: string;
		englishName: string;
		importance: ConceptImportance;
		learningMode: ConceptLearningMode;
		tags: string[];
		title: string;
		whyItMatters: string;
	};
	existingConceptId: string;
	incomingFingerprint: string;
	key: string;
	updatedAt: string;
}
