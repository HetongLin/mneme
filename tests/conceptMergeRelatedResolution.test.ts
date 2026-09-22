import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	ConceptMergeService,
	type ConceptMergeStorage,
	type ConceptMergeVaultAdapter,
} from "../src/services/conceptMergeService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

const survivor = concept("survivor", "Alpha", "Concepts/Alpha.md");
const merged = concept("merged", "Topic", "Concepts/Topic.md");
const reader = concept("reader", "Reader", "Concepts/Reader.md");

async function runAsyncTests(): Promise<void> {
	await nativeRelatedLinksUseSourceContext();
	await ordinaryNotesAreNotNeighbors();
	await unresolvedBareLinkIsPreserved();
	await copiedBareLinksKeepTheirDestination();
	await rootGeneratedLinkRequiresStableResolution();
	await nativeResolutionChangesDuringWritesRollback();
	await executeRechecksNativeRelatedState();
	await newMarkdownFileConflictsWithoutWrites();
}

async function unresolvedBareLinkIsPreserved(): Promise<void> {
	const vault = new MemoryVault({
		[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
		[merged.path]: conceptMarkdown(merged, "Topic meaning") + "\n## Related Concepts\n\n- [[Unknown]]\n",
	});
	vault.resolveLinkpath = () => undefined;
	const storage = new MemoryStorage();
	const service = new ConceptMergeService(vault, storage);
	const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") return;
	const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
	assert.ok(final.includes("[[Unknown|Unknown]]"));
	assert.equal((await service.execute(prepared.plan, final)).status, "merged");
}

async function copiedBareLinksKeepTheirDestination(): Promise<void> {
	for (const context of ["stable", "different", "newly-resolved", "missing-resolver"] as const) {
		const vault = new MemoryVault({
			[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
			[merged.path]: conceptMarkdown(merged, "Topic meaning") + "\n## Related Concepts\n\n- [[Note.md|authored note]]\n",
			"Note.md": "# Ordinary note\n",
			"Other/Note.md": "# Other ordinary note\n",
		});
		const calls: Array<[string, string]> = [];
		if (context !== "missing-resolver") vault.resolveLinkpath = (target, source) => {
			calls.push([target, source]);
			if (source === merged.path && target === "Note.md") return context === "newly-resolved" ? undefined : "Note.md";
			if (source === survivor.path && target === "Note") return context === "different" ? "Other/Note.md" : "Note.md";
			return undefined;
		};
		const before = structuredClone(vault.files);
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		if (context === "stable") {
			assert.equal(prepared.status, "ready");
			if (prepared.status !== "ready") continue;
			const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
			assert.ok(final.includes("[[Note|authored note]]"));
			assert.ok(calls.some(([target, source]) => target === "Note" && source === survivor.path));
			assert.equal((await service.execute(prepared.plan, final)).status, "merged");
			assert.equal(vault.files["Note.md"], before["Note.md"]);
		} else {
			assert.equal(prepared.status, "blocked", context);
			assert.deepEqual(vault.files, before);
			assert.equal(vault.commitCount, 0);
			assert.equal(storage.saveCount, 0);
		}
	}
}

async function rootGeneratedLinkRequiresStableResolution(): Promise<void> {
	const rootSurvivor = concept("root-survivor", "Alpha", "Alpha.md");
	const rootMerged = concept("root-merged", "Topic", "Topic.md");
	const rootReader = concept("root-reader", "Reader", "Reader.md");
	for (const destination of ["correct", "wrong", "unresolved"] as const) {
		const vault = new MemoryVault({
			[rootSurvivor.path]: conceptMarkdown(rootSurvivor, "Alpha meaning"),
			[rootMerged.path]: conceptMarkdown(rootMerged, "Topic meaning"),
			[rootReader.path]: conceptMarkdown(rootReader, "Reader meaning") + "\n## Related Concepts\n\n- [[Topic]]\n",
		});
		vault.resolveLinkpath = (linkpath, sourcePath) => {
			if (linkpath === "Topic" && sourcePath === rootReader.path) return rootMerged.path;
			if (linkpath === "Alpha" && sourcePath === rootReader.path) return rootSurvivor.path;
			if (linkpath === "Reader" && sourcePath === rootSurvivor.path) {
				return destination === "correct" ? rootReader.path : destination === "wrong" ? "Other/Reader.md" : undefined;
			}
			return undefined;
		};
		const before = structuredClone(vault.files);
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged: rootMerged, preserveMergedAsView: false, survivor: rootSurvivor });
		assert.equal(prepared.status, destination === "correct" ? "ready" : "blocked", destination);
		if (prepared.status === "ready") {
			const final = prepared.plan.writes.find((write) => write.path === rootSurvivor.path)!.after;
			assert.equal((await service.execute(prepared.plan, final)).status, "merged");
			assert.ok(vault.files[rootReader.path]?.includes("[[Alpha|Alpha]]"));
			assert.ok(vault.files[rootSurvivor.path]?.includes("[[Reader|Reader]]"));
		} else {
			assert.deepEqual(vault.files, before);
			assert.equal(vault.commitCount, 0);
			assert.equal(storage.saveCount, 0);
		}
	}
}

async function nativeResolutionChangesDuringWritesRollback(): Promise<void> {
	for (const trigger of [1, 2] as const) {
		const files = {
			[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
			[merged.path]: conceptMarkdown(merged, "Topic meaning"),
			[reader.path]: conceptMarkdown(reader, "Reader meaning") + "\n## Related Concepts\n\n- [[Topic]]\n",
		};
		const vault = new MemoryVault(files);
		let changed = false;
		let processCalls = 0;
		vault.resolveLinkpath = (linkpath, sourcePath) =>
			linkpath === "Topic" && sourcePath === reader.path ? (changed ? "Other/Topic.md" : merged.path) : undefined;
		vault.beforeProcess = () => {
			processCalls += 1;
			if (processCalls === trigger) changed = true;
		};
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready", `process ${trigger}`);
		if (prepared.status !== "ready") continue;
		const before = structuredClone(vault.files);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		const result = await service.execute(prepared.plan, final);
		assert.equal(result.status, "conflict", `process ${trigger}`);
		assert.deepEqual(vault.files, before, `process ${trigger} rollback`);
		assert.equal(storage.saveCount, 0, `process ${trigger} state`);
		assert.equal(vault.commitCount, trigger === 1 ? 0 : 2, "one forward write and its compensation");
	}
}

async function nativeRelatedLinksUseSourceContext(): Promise<void> {
	const files = {
		[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
		[merged.path]: conceptMarkdown(merged, "Topic meaning")
			+ "\n## Related Concepts\n\n- [[Reader|authored reader]]\n",
		[reader.path]: conceptMarkdown(reader, "Reader meaning")
			+ "\n## Related Concepts\n\n- [[Topic|authored topic]]\n",
		"Topic.md": "# Ordinary Topic\n\nThis is not a Concept.\n",
	};
	const vault = new MemoryVault(files);
	const calls: Array<[string, string]> = [];
	vault.resolveLinkpath = (linkpath, sourcePath) => {
		calls.push([linkpath, sourcePath]);
		if (linkpath === "Topic" && sourcePath === reader.path) return merged.path;
		if (linkpath === "Reader" && sourcePath === merged.path) return reader.path;
		return undefined;
	};
	const ordinaryBefore = files["Topic.md"];
	const result = await merge(vault);
	assert.equal(result.status, "merged");
	assert.ok(vault.files[reader.path]?.includes("[[Concepts/Alpha|Alpha]]"));
	assert.ok(vault.files[survivor.path]?.includes("[[Concepts/Reader|Reader]]"));
	assert.equal(vault.files["Topic.md"], ordinaryBefore);
	assert.ok(calls.some(([link, source]) => link === "Topic" && source === reader.path));
	assert.ok(!calls.some(([link, source]) => link === "Topic" && source === "Topic.md"));
}

async function ordinaryNotesAreNotNeighbors(): Promise<void> {
	const files = {
		[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
		[merged.path]: conceptMarkdown(merged, "Topic meaning"),
		[reader.path]: conceptMarkdown(reader, "Reader meaning")
			+ "\n## Related Concepts\n\n- [[Topic]]\n",
		"Topic.md": "# Ordinary Topic\n",
	};
	const vault = new MemoryVault(files);
	vault.resolveLinkpath = (linkpath, sourcePath) =>
		linkpath === "Topic" && sourcePath === reader.path ? "Topic.md" : undefined;
	const before = structuredClone(vault.files);
	const service = new ConceptMergeService(vault, new MemoryStorage());
	const prepared = await service.prepare({
		merged,
		preserveMergedAsView: false,
		survivor,
	});
	assert.equal(prepared.status, "ready");
	if (prepared.status === "ready") {
		assert.equal(prepared.plan.relatedConceptsRewired, 0);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		assert.equal((await service.execute(prepared.plan, final)).status, "merged");
		assert.equal(vault.files[reader.path], before[reader.path]);
		assert.equal(vault.files["Topic.md"], before["Topic.md"]);
	}
}

async function executeRechecksNativeRelatedState(): Promise<void> {
	for (const mutation of ["target", "identity", "new-related", "body"] as const) {
		const files = {
			[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
			[merged.path]: conceptMarkdown(merged, "Topic meaning"),
			[reader.path]: conceptMarkdown(reader, "Reader meaning")
				+ "\n## Related Concepts\n\n- [[Topic]]\n",
			"Topic.md": "# Ordinary Topic\n",
		};
		const vault = new MemoryVault(files);
		let targetChanged = false;
		vault.resolveLinkpath = (linkpath, sourcePath) => {
			if (linkpath === "Topic" && sourcePath === reader.path) {
				return targetChanged ? merged.path : "Topic.md";
			}
			return undefined;
		};
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready", mutation);
		if (prepared.status !== "ready") continue;
		assert.ok(!prepared.plan.writes.some((write) => write.path === reader.path), "reader is outside the write set");
		const beforeData = structuredClone(storage.data);
		if (mutation === "target") targetChanged = true;
		if (mutation === "identity") vault.files["Topic.md"] = "---\nmneme_type: concept\nmneme_id: changed\n---\n# Topic\n";
		if (mutation === "new-related") vault.files[reader.path] += "\n- [[New.md]]\n";
		if (mutation === "body") vault.files["Topic.md"] += "\nA learner edit.\n";
		const afterMutationFiles = structuredClone(vault.files);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		const result = await service.execute(prepared.plan, final);
		if (mutation === "body") {
			assert.equal(result.status, "merged");
			assert.equal(vault.files["Topic.md"], afterMutationFiles["Topic.md"]);
		} else {
			assert.equal(result.status, "conflict", mutation);
			assert.deepEqual(vault.files, afterMutationFiles);
			assert.deepEqual(storage.data, beforeData);
			assert.equal(vault.commitCount, 0);
		}
	}
}

async function newMarkdownFileConflictsWithoutWrites(): Promise<void> {
	const vault = new MemoryVault({
		[survivor.path]: conceptMarkdown(survivor, "Alpha meaning"),
		[merged.path]: conceptMarkdown(merged, "Topic meaning"),
	});
	const storage = new MemoryStorage();
	const service = new ConceptMergeService(vault, storage);
	const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
	assert.equal(prepared.status, "ready");
	if (prepared.status !== "ready") return;
	vault.files["New.md"] = "# New\n";
	const before = structuredClone(vault.files);
	const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
	assert.equal((await service.execute(prepared.plan, final)).status, "conflict");
	assert.deepEqual(vault.files, before);
	assert.equal(vault.commitCount, 0);
	assert.equal(storage.saveCount, 0);
}

async function merge(vault: MemoryVault) {
	const storage = new MemoryStorage();
	const service = new ConceptMergeService(vault, storage);
	const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
	if (prepared.status !== "ready") throw new Error(prepared.message);
	const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
	return service.execute(prepared.plan, final);
}

class MemoryVault implements ConceptMergeVaultAdapter {
	resolveLinkpath?: (linkpath: string, sourcePath: string) => string | undefined;
	beforeProcess?: () => void;
	commitCount = 0;
	constructor(public files: Record<string, string>) {}
	async exists(path: string): Promise<boolean> { return this.files[path] !== undefined; }
	async read(path: string): Promise<string> {
		const value = this.files[path];
		if (value === undefined) throw new Error(`Missing file: ${path}`);
		return value;
	}
	async listMarkdownFiles(): Promise<Array<{ path: string }>> {
		return Object.keys(this.files).filter((path) => path.endsWith(".md")).map((path) => ({ path }));
	}
	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.beforeProcess?.();
		this.files[path] = transform(await this.read(path));
		this.commitCount += 1;
	}
}

class MemoryStorage implements ConceptMergeStorage {
	data: MnemePluginData = createDefaultPluginData();
	saveCount = 0;
	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: MnemePluginData): Promise<void> { this.data = data; this.saveCount += 1; }
}

function concept(conceptId: string, title: string, path: string): ConceptSummary {
	return { conceptId, coreMeaning: `${title} core`, path, title };
}

function conceptMarkdown(item: ConceptSummary, body: string): string {
	return ["---", "mneme_type: concept", `mneme_id: ${item.conceptId}`, "---", `# ${item.title}`, "", body, ""].join("\n");
}

export const done = runAsyncTests();
