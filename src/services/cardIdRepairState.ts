import type { MnemePluginData } from "../models/reviewState";
import { assertCardDeletionAllowsCard } from "./cardDeletionReceipt";
import { assertCardNotDeleting } from "./conceptDeletionReceipt";

/** Pure state migration, composed inside the caller's existing storage queue. */
export function withRekeyedCardState(data: MnemePluginData, oldCardId: string, newCardId: string): MnemePluginData {
	assertCardDeletionAllowsCard(data.cardDeletion, oldCardId);
	assertCardDeletionAllowsCard(data.cardDeletion, newCardId);
	assertCardNotDeleting(data.conceptDeletions, oldCardId);
	assertCardNotDeleting(data.conceptDeletions, newCardId);
	if (Object.prototype.hasOwnProperty.call(data.cardTombstones, oldCardId)) throw new Error("Deleted Card IDs cannot be migrated.");
	if ([data.cardTombstones, data.reviewStates, data.reviewDeferrals, data.retiredCards, data.suspendedCards]
		.some((records) => Object.prototype.hasOwnProperty.call(records, newCardId))
		|| Object.values(data.reviewEvents).some((event) => event.cardId === newCardId)) {
		throw new Error("The new Card ID already has review state or history.");
	}

	const reviewState = ownValue(data.reviewStates, oldCardId);
	const deferral = ownValue(data.reviewDeferrals, oldCardId);
	const retirement = ownValue(data.retiredCards, oldCardId);
	const suspension = ownValue(data.suspendedCards, oldCardId);
	const nextData = {
		...data,
		reviewEvents: Object.fromEntries(Object.entries(data.reviewEvents).map(([eventId, event]) => [
			eventId,
			event.cardId === oldCardId ? { ...event, cardId: newCardId } : event,
		])),
		reviewDeferrals: {
			...omitKey(data.reviewDeferrals, oldCardId),
			...(deferral ? { [newCardId]: { ...deferral, cardId: newCardId } } : {}),
		},
		reviewStates: {
			...omitKey(data.reviewStates, oldCardId),
			...(reviewState ? { [newCardId]: { ...reviewState, cardId: newCardId } } : {}),
		},
		retiredCards: {
			...omitKey(data.retiredCards, oldCardId),
			...(retirement ? { [newCardId]: { ...retirement, cardId: newCardId } } : {}),
		},
		suspendedCards: {
			...omitKey(data.suspendedCards, oldCardId),
			...(suspension ? { [newCardId]: { ...suspension, cardId: newCardId } } : {}),
		},
	};
	return nextData;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
	return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
