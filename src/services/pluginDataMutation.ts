import type { MnemePluginData } from "../models/reviewState";

export interface PluginDataStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

const pendingMutations = new WeakMap<PluginDataStorage, Promise<void>>();

/**
 * Serialize the complete read/modify/save operation for one storage owner.
 * All stores for a Vault must share that owner. Do not acquire this lock again
 * from inside an operation; compose state changes within the existing callback.
 */
export function runPluginDataMutation<T>(
	storage: PluginDataStorage,
	operation: () => Promise<T>,
): Promise<T> {
	const previous = pendingMutations.get(storage) ?? Promise.resolve();
	const result = previous.then(operation);
	// The caller receives the failure; subsequent mutations must still run.
	const settled = result.then(() => undefined, () => undefined);
	pendingMutations.set(storage, settled);
	void settled.then(() => {
		if (pendingMutations.get(storage) === settled) pendingMutations.delete(storage);
	});
	return result;
}
