import assert from "node:assert/strict";
import {
	computeContentHash,
	normalizeSourceContentForHash,
} from "../src/utils/sourceHash";

async function runAsyncTests(): Promise<void> {
	{
		const first = await computeContentHash("# Concept\nSame content\n");
		const second = await computeContentHash("# Concept\nSame content\n");

		assert.equal(first, second);
		assert.match(first, /^[0-9a-f]{64}$/);
	}

	{
		const first = await computeContentHash("# Concept\nA\n");
		const second = await computeContentHash("# Concept\nB\n");

		assert.notEqual(first, second);
	}

	{
		assert.equal(
			await computeContentHash("Line 1\r\nLine 2\r\n"),
			await computeContentHash("Line 1\nLine 2\n"),
		);
		assert.equal(normalizeSourceContentForHash("Line 1\rLine 2"), "Line 1\nLine 2");
	}

	{
		assert.notEqual(
			await computeContentHash("```ts\nconst x = 1;\n```\n"),
			await computeContentHash("```ts\n const x = 1;\n```\n"),
		);
	}
}

export const done = runAsyncTests();
