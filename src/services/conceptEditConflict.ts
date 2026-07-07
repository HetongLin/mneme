import type { ConceptImportance, ConceptLearningMode } from "../models/conceptLibrary";
import { readConceptEditableMetadata } from "./conceptMetadataUpdater";
import { extractCoreMeaning, extractWhyItMatters } from "./conceptMarkdownParser";

export interface ConceptEditBaseline {
	coreMeaning: string;
	importance?: ConceptImportance;
	learningMode?: ConceptLearningMode;
	whyItMatters: string;
}

export function hasTargetedConceptEditConflict(
	baseline: ConceptEditBaseline,
	currentMarkdown: string,
): boolean {
	const currentMetadata = readConceptEditableMetadata(currentMarkdown);

	return (extractCoreMeaning(currentMarkdown) ?? "") !== baseline.coreMeaning
		|| (extractWhyItMatters(currentMarkdown) ?? "") !== baseline.whyItMatters
		|| currentMetadata.importance !== baseline.importance
		|| currentMetadata.learningMode !== baseline.learningMode;
}
