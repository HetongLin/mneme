import { ConceptPriorityBand } from "./conceptMemory";
import { ReviewQueueConcept } from "./reviewQueue";

export interface RankedReviewQueueConcept {
	concept: ReviewQueueConcept;
	priorityBand: ConceptPriorityBand;
	priorityScore: number;
	rank: number;
}
