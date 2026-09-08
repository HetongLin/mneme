import type { CardTombstone, MnemePluginData } from "../models/reviewState";

export function withDeletedCardState(
	data: MnemePluginData,
	cardId: string,
	deletedAt: string,
): MnemePluginData {
	if (!cardId.trim() || Number.isNaN(Date.parse(deletedAt))) {
		throw new Error("Card deletion requires a Card id and valid time.");
	}

	const existing = Object.prototype.hasOwnProperty.call(data.cardTombstones, cardId)
		? data.cardTombstones[cardId] : undefined;
	const reviewState = data.reviewStates[cardId];
	const tombstone: CardTombstone = existing ?? {
		cardId,
		deletedAt,
		lapseCount: reviewState?.lapseCount ?? 0,
		reviewCount: reviewState?.reviewCount ?? 0,
	};

	return {
		...data,
		cardTombstones: {
			...data.cardTombstones,
			[cardId]: tombstone,
		},
		retiredCards: omitKey(data.retiredCards, cardId),
		reviewDeferrals: omitKey(data.reviewDeferrals, cardId),
		reviewStates: omitKey(data.reviewStates, cardId),
		suspendedCards: omitKey(data.suspendedCards, cardId),
	};
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const result = { ...record };
	delete result[key];
	return result;
}
