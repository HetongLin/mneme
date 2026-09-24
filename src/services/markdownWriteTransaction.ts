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
	constructor(readonly path: string) {
		super(`${path} changed after preview. Rebuild the preview before trying again.`);
		this.name = "MarkdownWriteConflict";
	}
}

/** Apply reviewed snapshots and compensate attempted writes if any step fails. */
export async function executeMarkdownWriteTransaction(
	vault: TransactionalMarkdownVault,
	writes: readonly MarkdownSnapshotWrite[],
	persistence?: MarkdownTransactionPersistence,
): Promise<void> {
	const attemptedWrites: MarkdownSnapshotWrite[] = [];
	let persistenceAttempted = false;
	try {
		for (const write of writes) {
			if (write.after === write.before) continue;
			let tracked = false;
			await vault.process(write.path, (current) => {
				if (current !== write.before) throw new MarkdownWriteConflict(write.path);
				// process may apply this result and then reject. Track only after
				// the precondition passes, so conflicts never claim another edit.
				if (!tracked) {
					attemptedWrites.push(write);
					tracked = true;
				}
				return write.after;
			});
		}
		if (persistence) {
			persistenceAttempted = true;
			await persistence.commit();
		}
	} catch (error) {
		const rollbackErrors: string[] = [];
		for (const write of [...attemptedWrites].reverse()) {
			try {
				await vault.process(write.path, (current) => {
					// A rejected process may also have left the original untouched.
					if (current === write.before) return current;
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
