import type { MnemePluginData, CardTombstone } from "../models/reviewState";

export function withDeletedConceptState(
	data: MnemePluginData,
	conceptId: string,
	cardIds: string[],
	deletedAt: string,
): MnemePluginData {
	if (!conceptId.trim() || Number.isNaN(Date.parse(deletedAt))) {
		throw new Error("Concept deletion requires a Concept id and valid time.");
	}

	const uniqueCardIds = [...new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean))];
	const tombstones = uniqueCardIds.map((cardId): CardTombstone => {
		const existing = data.cardTombstones[cardId];
		if (existing) return existing;
		const reviewState = data.reviewStates[cardId];
		return {
			cardId,
			deletedAt,
			lapseCount: reviewState?.lapseCount ?? 0,
			reviewCount: reviewState?.reviewCount ?? 0,
		};
	});
	const deletedCardIds = new Set(uniqueCardIds);
	const omitDeletedCards = <T>(records: Record<string, T>): Record<string, T> => (
		Object.fromEntries(Object.entries(records).filter(([cardId]) => !deletedCardIds.has(cardId)))
	);

	return {
		...data,
		cardTombstones: {
			...data.cardTombstones,
			...Object.fromEntries(tombstones.map((tombstone) => [tombstone.cardId, tombstone])),
		},
		conceptDuplicateDismissals: Object.fromEntries(
			Object.entries(data.conceptDuplicateDismissals)
				.filter(([, dismissal]) => !dismissal.conceptIds.includes(conceptId)),
		),
		conceptMergeRecords: Object.fromEntries(
			Object.entries(data.conceptMergeRecords)
				.filter(([, record]) => (
					record.mergedConceptId !== conceptId && record.survivorConceptId !== conceptId
				)),
		),
		conceptSourceLinks: Object.fromEntries(
			Object.entries(data.conceptSourceLinks)
				.filter(([, link]) => link.conceptId !== conceptId),
		),
		pausedConcepts: omitKey(data.pausedConcepts, conceptId),
		retiredCards: omitDeletedCards(data.retiredCards),
		reviewDeferrals: omitDeletedCards(data.reviewDeferrals),
		reviewStates: omitDeletedCards(data.reviewStates),
		sourceAnalysisRecords: Object.fromEntries(
			Object.entries(data.sourceAnalysisRecords).map(([sourcePath, record]) => [
				sourcePath,
				{ ...record, linkedConceptIds: record.linkedConceptIds.filter((id) => id !== conceptId) },
			]),
		),
		suspendedCards: omitDeletedCards(data.suspendedCards),
	};
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const result = { ...record };
	delete result[key];
	return result;
}
