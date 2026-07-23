import assert from "node:assert/strict";
import { waitForReviewableConcept } from "../src/services/conceptReviewAvailability";

async function run(): Promise<void> {
	{
		let loads = 0;
		const delays: number[] = [];
		const available = await waitForReviewableConcept(async () => {
			loads += 1;
			return [{
				cards: loads < 3 ? [] : [{ isValid: true }],
				id: "concept-spacing-effect",
			}];
		}, "concept-spacing-effect", {
			attempts: 5,
			delayMs: 10,
			sleep: async (delay) => {
				delays.push(delay);
			},
		});

		assert.equal(available, true);
		assert.equal(loads, 3);
		assert.deepEqual(delays, [10, 20]);
	}

	{
		let loads = 0;
		const available = await waitForReviewableConcept(async () => {
			loads += 1;
			return [{ cards: [], id: "concept-empty" }];
		}, "concept-empty", {
			attempts: 3,
			delayMs: 0,
			sleep: async () => undefined,
		});

		assert.equal(available, false);
		assert.equal(loads, 3);
	}

	{
		let loads = 0;
		const available = await waitForReviewableConcept(async () => {
			loads += 1;
			return [{ cards: [{ isValid: true }], id: "concept-ready" }];
		}, "concept-ready", {
			attempts: 5,
			sleep: async () => {
				throw new Error("Ready Concepts must not wait.");
			},
		});

		assert.equal(available, true);
		assert.equal(loads, 1);
	}

	console.log("Concept review availability tests passed.");
}

void run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
