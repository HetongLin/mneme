import type { MnemePluginData } from "../models/reviewState";

/** Compose pause migration inside an existing storage transaction. Other provenance stays unchanged. */
export function withRekeyedConceptPause(data: MnemePluginData, oldId: string, newId: string): MnemePluginData {
	if (Object.prototype.hasOwnProperty.call(data.pausedConcepts, newId)) throw new Error("The new Concept ID already has review state.");
	const pause = Object.prototype.hasOwnProperty.call(data.pausedConcepts, oldId) ? data.pausedConcepts[oldId] : undefined;
	return { ...data, pausedConcepts: {
		...Object.fromEntries(Object.entries(data.pausedConcepts).filter(([key]) => key !== oldId)),
		...(pause ? { [newId]: { ...pause, conceptId: newId } } : {}),
	} };
}
