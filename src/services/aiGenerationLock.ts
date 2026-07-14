export type AiGenerationOperation = "card_generation" | "concept_capture";

export interface AiGenerationLease {
	release(): void;
}

export class AiGenerationLock {
	private readonly activeKeys = new Set<string>();

	tryAcquire(operation: AiGenerationOperation, sourcePath: string): AiGenerationLease | undefined {
		const key = createKey(operation, sourcePath);
		if (this.activeKeys.has(key)) return undefined;

		this.activeKeys.add(key);
		let released = false;

		return {
			release: () => {
				if (released) return;
				released = true;
				this.activeKeys.delete(key);
			},
		};
	}

	isActive(operation: AiGenerationOperation, sourcePath: string): boolean {
		return this.activeKeys.has(createKey(operation, sourcePath));
	}
}

function createKey(operation: AiGenerationOperation, sourcePath: string): string {
	return `${operation}\u0000${sourcePath}`;
}
