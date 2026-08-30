const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const ID_TOKEN_LENGTH = 8;
const MAX_ALLOCATION_ATTEMPTS = 128;

type EntityIdPrefix = "card" | "concept";

export function createRandomConceptId(random: () => number = Math.random): string {
	return createRandomEntityId("concept", random);
}

export function createRandomCardId(random: () => number = Math.random): string {
	return createRandomEntityId("card", random);
}

export function createUniqueRandomConceptId(
	reservedIds: ReadonlySet<string>,
	random: () => number = Math.random,
): string {
	return createUniqueRandomEntityId("concept", reservedIds, random);
}

export function createUniqueRandomCardId(
	reservedIds: ReadonlySet<string>,
	random: () => number = Math.random,
): string {
	return createUniqueRandomEntityId("card", reservedIds, random);
}

function createRandomEntityId(prefix: EntityIdPrefix, random: () => number): string {
	let token = "";

	for (let index = 0; index < ID_TOKEN_LENGTH; index += 1) {
		const sample = random();
		const randomValue = Number.isFinite(sample)
			? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
			: 0;
		token += ID_ALPHABET[Math.floor(randomValue * ID_ALPHABET.length)];
	}

	return `${prefix}-${token}`;
}

function createUniqueRandomEntityId(
	prefix: EntityIdPrefix,
	reservedIds: ReadonlySet<string>,
	random: () => number,
): string {
	for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
		const candidate = createRandomEntityId(prefix, random);
		if (!reservedIds.has(candidate)) return candidate;
	}

	throw new Error(`No available random ${prefix === "concept" ? "Concept" : "Card"} ID could be allocated.`);
}
