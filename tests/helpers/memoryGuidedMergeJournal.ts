import type { GuidedMergeJournal } from "../../src/services/guidedConceptMergeRecovery";

/**
 * Small deterministic journal used by Guided Merge recovery tests.
 * The journal stores opaque JSON text just like the durable adapter does and
 * supports one-shot failures at each boundary so tests can reconstruct a
 * service without sharing in-memory operation state.
 */
export class MemoryGuidedMergeJournal implements GuidedMergeJournal {
	private readonly entries = new Map<string, string>();
	readonly writes: string[] = [];
	readonly removes: string[] = [];
	failWrite = false;
	failAfterWrite = false;
	failRead = false;
	failRemove = false;

	constructor(initial: Record<string, string> = {}) {
		for (const [operationId, contents] of Object.entries(initial)) {
			this.entries.set(operationId, contents);
		}
	}

	async read(operationId: string): Promise<string> {
		if (this.failRead) {
			this.failRead = false;
			throw new Error("Injected Guided Merge journal read failure");
		}
		const contents = this.entries.get(operationId);
		if (contents === undefined) throw new Error(`Missing Guided Merge journal: ${operationId}`);
		return contents;
	}

	async write(operationId: string, contents: string): Promise<void> {
		if (this.failWrite) {
			this.failWrite = false;
			throw new Error("Injected Guided Merge journal write failure");
		}
		this.entries.set(operationId, contents);
		this.writes.push(operationId);
		if (this.failAfterWrite) { this.failAfterWrite = false; throw new Error("Injected post-write journal failure"); }
	}

	async remove(operationId: string): Promise<void> {
		if (this.failRemove) {
			this.failRemove = false;
			throw new Error("Injected Guided Merge journal remove failure");
		}
		this.entries.delete(operationId);
		this.removes.push(operationId);
	}

	has(operationId: string): boolean {
		return this.entries.has(operationId);
	}

	get(operationId: string): string | undefined {
		return this.entries.get(operationId);
	}

	set(operationId: string, contents: string): void {
		this.entries.set(operationId, contents);
	}

	clone(): MemoryGuidedMergeJournal {
		return new MemoryGuidedMergeJournal(Object.fromEntries(this.entries));
	}
}
