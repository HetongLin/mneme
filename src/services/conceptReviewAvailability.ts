export interface ReviewableConceptSnapshot {
	cards: Array<{ isValid: boolean }>;
	id: string;
}

export interface ReviewAvailabilityRetryOptions {
	attempts?: number;
	delayMs?: number;
	sleep?: (delayMs: number) => Promise<void>;
}

/**
 * Waits briefly for a newly written Card Group to become visible to Obsidian's
 * vault and metadata indexes. This is only for the Generate-to-Review
 * continuation; an ordinary empty Concept should still fail immediately.
 */
export async function waitForReviewableConcept(
	loadConcepts: () => Promise<ReviewableConceptSnapshot[]>,
	conceptId: string,
	options: ReviewAvailabilityRetryOptions = {},
): Promise<boolean> {
	const attempts = Math.max(1, options.attempts ?? 5);
	const delayMs = Math.max(0, options.delayMs ?? 80);
	const sleep = options.sleep ?? defaultSleep;

	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const concepts = await loadConcepts();
		const concept = concepts.find((candidate) => candidate.id === conceptId);

		if (concept?.cards.some((card) => card.isValid)) {
			return true;
		}

		if (attempt < attempts - 1) {
			await sleep(delayMs * (attempt + 1));
		}
	}

	return false;
}

function defaultSleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}
