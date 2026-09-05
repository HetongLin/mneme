export interface TransactionalMarkdownVault {
	read(path: string): Promise<string>;
	/** Read, transform, and write atomically; a thrown transform must not write. */
	process(path: string, transform: (current: string) => string): Promise<void>;
}

export interface MarkdownSnapshotWrite {
	after: string;
	before: string;
	path: string;
}

export interface MarkdownTransactionPersistence {
	commit(): Promise<void>;
	rollback(): Promise<void>;
}

export class MarkdownWriteConflict extends Error {
	constructor(path: string) {
		super(`${path} changed after preview. Rebuild the preview before trying again.`);
		this.name = "MarkdownWriteConflict";
	}
}

/** Apply reviewed snapshots and compensate completed writes if a later step fails. */
export async function executeMarkdownWriteTransaction(
	vault: TransactionalMarkdownVault,
	writes: readonly MarkdownSnapshotWrite[],
	persistence?: MarkdownTransactionPersistence,
): Promise<void> {
	const written: MarkdownSnapshotWrite[] = [];
	let persistenceAttempted = false;
	try {
		for (const write of writes) {
			if (write.after === write.before) continue;
			await vault.process(write.path, (current) => {
				if (current !== write.before) throw new MarkdownWriteConflict(write.path);
				return write.after;
			});
			written.push(write);
		}
		if (persistence) {
			persistenceAttempted = true;
			await persistence.commit();
		}
	} catch (error) {
		const rollbackErrors: string[] = [];
		for (const write of [...written].reverse()) {
			try {
				await vault.process(write.path, (current) => {
					if (current !== write.after) {
						throw new Error("changed after Mneme wrote it; rollback did not overwrite the newer content");
					}
					return write.before;
				});
			} catch (rollbackError) {
				rollbackErrors.push(`${write.path}: ${formatError(rollbackError)}`);
			}
		}
		if (persistenceAttempted && persistence) {
			try {
				await persistence.rollback();
			} catch (rollbackError) {
				rollbackErrors.push(`plugin data: ${formatError(rollbackError)}`);
			}
		}
		if (rollbackErrors.length > 0) {
			throw new Error(`${formatError(error)} Rollback also failed: ${rollbackErrors.join("; ")}`);
		}
		throw error;
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
