import assert from "node:assert/strict";
import { ObsidianGuidedMergeJournal } from "../src/services/obsidianGuidedMergeJournal";

async function run(): Promise<void> {
	const files = new Map<string, string>();
	const folders = new Set<string>();
	const changes: string[] = [];
	const adapter = {
		async exists(path: string) { return files.has(path) || folders.has(path); },
		async read(path: string) { const text = files.get(path); if (text === undefined) throw new Error("missing"); return text; },
		async write(path: string, text: string) { files.set(path, text); changes.push(`write:${path}`); },
		async mkdir(path: string) { folders.add(path); },
		async remove(path: string) { files.delete(path); changes.push(`remove:${path}`); },
	};
	const journal = new ObsidianGuidedMergeJournal(adapter, ".obsidian/plugins/mneme");
	const path = ".obsidian/plugins/mneme/guided-merge-recovery/op-1.json";
	await journal.write("op-1", "snapshot\r\n");
	assert.equal(await journal.read("op-1"), "snapshot\r\n");
	await journal.write("op-1", "snapshot\r\n");
	assert.deepEqual(changes, [`write:${path}`], "identical retry must not rewrite the journal");
	await assert.rejects(() => journal.write("op-1", "different"), /different content/);
	assert.equal(await journal.read("op-1"), "snapshot\r\n");
	for (const id of ["../op", "a/b", "a\\b", "", "a\n"]) await assert.rejects(() => journal.write(id, "bad"), /operation ID/);
	for (const directory of ["../plugins", "/tmp", "C:/tmp", "plugins/../tmp", "plugins\n", "plugins/./tmp", "plugins//tmp", "plugins\\tmp"]) {
		await assert.rejects(() => new ObsidianGuidedMergeJournal(adapter, directory).write("op", "bad"), /directory/);
	}
	files.set(".obsidian/plugins/mneme/data.json", "keep");
	await journal.remove("op-1");
	await journal.remove("op-1");
	assert.equal(files.get(".obsidian/plugins/mneme/data.json"), "keep");
	assert.deepEqual(changes, [`write:${path}`, `remove:${path}`]);
}
export const done = run();
