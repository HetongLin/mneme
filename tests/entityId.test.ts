import assert from "node:assert/strict";
import {
	createRandomCardId,
	createRandomConceptId,
	createUniqueRandomCardId,
	createUniqueRandomConceptId,
} from "../src/services/entityId";

const deterministic = (...values: number[]): (() => number) => {
	let index = 0;
	return () => values[index++] ?? 0;
};

assert.equal(
	createRandomConceptId(deterministic(0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7)),
	"concept-258behmq",
);
assert.equal(
	createRandomCardId(deterministic(0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0)),
	"card-qmheb852",
);
assert.match(createRandomConceptId(), /^concept-[23456789abcdefghjkmnpqrstuvwxyz]{8}$/u);
assert.match(createRandomCardId(), /^card-[23456789abcdefghjkmnpqrstuvwxyz]{8}$/u);
assert.equal(createRandomConceptId(() => Number.NaN), "concept-22222222");

{
	const values = [
		...Array(8).fill(0),
		...Array(8).fill(0.1),
	];
	const id = createUniqueRandomConceptId(
		new Set(["concept-22222222"]),
		deterministic(...values),
	);
	assert.equal(id, "concept-55555555");
}

{
	const id = createUniqueRandomCardId(
		new Set(["card-22222222"]),
		deterministic(...Array(8).fill(0.2)),
	);
	assert.equal(id, "card-88888888");
}

console.log("Entity ID tests passed.");
