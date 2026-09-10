import assert from "node:assert/strict";
import {
	executeMarkdownWriteTransaction,
	MarkdownWriteConflict,
	type MarkdownSnapshotWrite,
	type TransactionalMarkdownVault,
} from "../src/services/markdownWriteTransaction";

type FailurePhase = "before-transform" | "after-transform" | "after-write";

class FaultVault implements TransactionalMarkdownVault {
	readonly calls: string[] = [];
	failure?: { path: string; phase: FailurePhase; edit?: string };
	readonly error = new Error("Injected process failure");

	constructor(readonly files: Record<string, string>) {}

	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.calls.push(path);
		const failure = this.failure?.path === path ? this.failure : undefined;
		if (failure) this.failure = undefined;
		if (failure?.phase === "before-transform") throw this.error;
		const next = transform(await this.read(path));
		if (failure?.phase === "after-transform") throw this.error;
		this.files[path] = next;
		if (failure?.phase === "after-write") {
			if (failure.edit) this.files[path] += failure.edit;
			throw this.error;
		}
	}
}

const writes: MarkdownSnapshotWrite[] = [
	{ path: "A.md", before: "A before", after: "A after" },
	{ path: "B.md", before: "B before", after: "B after" },
	{ path: "C.md", before: "C before", after: "C after" },
];

function createVault(): FaultVault {
	return new FaultVault(Object.fromEntries(writes.map((write) => [write.path, write.before])));
}

async function runTests(): Promise<void> {
	for (const phase of ["after-write", "before-transform", "after-transform"] as const) {
		const vault = createVault();
		const before = { ...vault.files };
		let commits = 0;
		let rollbacks = 0;
		vault.failure = { path: "B.md", phase };
		await assert.rejects(executeMarkdownWriteTransaction(vault, writes, {
			commit: async () => { commits += 1; },
			rollback: async () => { rollbacks += 1; },
		}), (error: unknown) => error === vault.error);
		assert.deepEqual(vault.files, before, phase);
		assert.deepEqual(vault.calls, phase === "before-transform"
			? ["A.md", "B.md", "A.md"]
			: ["A.md", "B.md", "B.md", "A.md"], phase);
		assert.equal(commits, 0);
		assert.equal(rollbacks, 0);
	}

	// Another writer may have produced our planned result. A failed precondition
	// does not establish ownership, so compensation must never touch that file.
	for (const concurrentContent of ["B learner edit", "B after"]) {
		const vault = createVault();
		vault.files["B.md"] = concurrentContent;
		await assert.rejects(executeMarkdownWriteTransaction(vault, writes), MarkdownWriteConflict);
		assert.equal(vault.files["A.md"], "A before");
		assert.equal(vault.files["B.md"], concurrentContent);
		assert.equal(vault.files["C.md"], "C before");
		assert.deepEqual(vault.calls, ["A.md", "B.md", "A.md"]);
	}

	{
		const vault = createVault();
		vault.failure = { path: "B.md", phase: "after-write", edit: "\nLearner edit" };
		await assert.rejects(executeMarkdownWriteTransaction(vault, writes),
			/Injected process failure Rollback also failed: B\.md: changed after Mneme wrote it/);
		assert.deepEqual(vault.files, {
			"A.md": "A before", "B.md": "B after\nLearner edit", "C.md": "C before",
		});
	}

	{
		const vault = createVault();
		const failure = new Error("State commit failed");
		let stateRollbacks = 0;
		await assert.rejects(executeMarkdownWriteTransaction(vault, writes, {
			commit: async () => { throw failure; },
			rollback: async () => { stateRollbacks += 1; },
		}), (error: unknown) => error === failure);
		assert.deepEqual(vault.files, createVault().files);
		assert.deepEqual(vault.calls, ["A.md", "B.md", "C.md", "C.md", "B.md", "A.md"]);
		assert.equal(stateRollbacks, 1);
	}

	{
		const vault = createVault();
		let commits = 0;
		await executeMarkdownWriteTransaction(vault, [
			{ path: "unchanged.md", before: "same", after: "same" }, ...writes,
		], {
			commit: async () => { commits += 1; },
			rollback: async () => { assert.fail("Successful writes must not roll back"); },
		});
		assert.deepEqual(vault.files, Object.fromEntries(writes.map((write) => [write.path, write.after])));
		assert.deepEqual(vault.calls, ["A.md", "B.md", "C.md"]);
		assert.equal(commits, 1);
	}
}

export const done = runTests();
