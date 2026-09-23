import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	ConceptMergeService,
	type ConceptMergeStorage,
	type ConceptMergeVaultAdapter,
} from "../src/services/conceptMergeService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { getConceptId } from "../src/services/conceptIdEditor";
import { MemoryGuidedMergeJournal } from "./helpers/memoryGuidedMergeJournal";

const survivor = concept("concept-a", "Alpha", "Notes/Alpha.md");
const merged = concept("concept-b", "Beta", "Notes/Beta.md");

async function runAsyncTests(): Promise<void> {
	for (const newline of ["\n", "\r\n"]) {
		for (const preserveMergedAsView of [false, true]) {
			const sourceBody = preserveMergedAsView
				? ["# Beta", "", "A safe merged perspective.", "", "## Details", "", "Keep this detail."].join(newline)
				: [
					"# Beta",
					"",
					"Keep this heading and body.",
					"",
					"<!-- an HTML comment with [[Beta]] -->",
					"",
					"```markdown",
					"Local example: [[Notes/Local|local reference]]",
					"```",
					"",
					"## Local references",
					"",
					"[[Notes/Local|local reference]]",
					"",
					"![local image](./attachment.png)",
					"[same-note](#local-heading)",
				].join(newline);
			const source = sourceMarkdown(newline, sourceBody);
			const files = {
				[survivor.path]: conceptMarkdown(survivor, newline),
				[merged.path]: source,
			};
			const vault = new MemoryVault(files);
			const storage = new MemoryStorage();
			const service = new ConceptMergeService(vault, storage, () => "2026-09-22T10:00:00.000Z", new MemoryGuidedMergeJournal());
			const prepared = await service.prepare({ merged, preserveMergedAsView, survivor });
			assert.equal(prepared.status, "ready", prepared.status === "blocked" ? prepared.message : undefined);
			if (prepared.status !== "ready") continue;

			const redirect = prepared.plan.writes.find((write) => write.path === merged.path)?.after ?? "";
			const sourceFrontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)?.[0] ?? "";
			const originalBody = source.slice(sourceFrontmatter.length);
			const customYaml = /aliases:[\s\S]*?# custom YAML comment/.exec(sourceFrontmatter)?.[0] ?? "";
			assert.equal(readFrontmatter(redirect, "mneme_type"), "concept_redirect");
			assert.equal(readFrontmatter(redirect, "mneme_id"), undefined);
			assert.equal(readFrontmatter(redirect, "former_mneme_id"), merged.conceptId);
			assert.equal(readFrontmatter(redirect, "merged_into"), survivor.conceptId);
			assert.equal(readFrontmatter(redirect, "merged_at"), "2026-09-22T10:00:00.000Z");
			assert.match(readFrontmatter(redirect, "redirect_to") ?? "", /Notes\/Alpha/);
			assert.ok(customYaml.length > 0);
			assert.ok(redirect.includes(customYaml), "redirect changed custom YAML bytes");
			for (const fragment of [
				"aliases:",
				"  - beta alias",
				"nested:",
				"  owner:",
				"    team: learning",
				"description: |",
				"  A multiline custom value.",
				"# custom YAML comment",
			]) assert.ok(redirect.includes(fragment), `redirect lost custom YAML fragment: ${fragment}`);
			const noticeIndex = redirect.indexOf(`> This Concept was merged into`);
			assert.ok(noticeIndex >= 0);
			assert.equal(redirect.slice(redirect.indexOf(`# Beta`, noticeIndex)), originalBody);
			assert.notEqual(getConceptId(redirect), merged.conceptId);

			const finalSurvivor = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			if (preserveMergedAsView) {
				assert.ok(finalSurvivor.includes("A safe merged perspective."));
			} else {
				assert.ok(!finalSurvivor.includes("Keep this heading and body."));
			}
			assert.deepEqual(await service.execute(prepared.plan, finalSurvivor), { status: "merged" });
			assert.equal(vault.files[merged.path], redirect);
			assert.equal(vault.files[survivor.path], finalSurvivor);
		}
	}

	{
		const files = baseFiles("\n", "# Beta\n\nQuoted identity body");
		files[merged.path] = files[merged.path]!
			.replace("mneme_type: concept", 'mneme_type: "concept" # type comment')
			.replace("mneme_id: concept-b", 'mneme_id: "concept-b" # identity comment')
			.replace("# custom YAML comment", 'mneme_version: "1" # version comment\n# custom YAML comment');
		const vault = new MemoryVault(files);
		const service = new ConceptMergeService(vault, new MemoryStorage(), () => "2026-09-22T10:00:00.000Z", new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready", prepared.status === "blocked" ? prepared.message : undefined);
		if (prepared.status !== "ready") return;
		const redirect = prepared.plan.writes.find((write) => write.path === merged.path)?.after ?? "";
		assert.ok(redirect.includes("mneme_type: concept_redirect # type comment"));
		assert.ok(redirect.includes('former_mneme_id: "concept-b" # identity comment'));
		assert.ok(redirect.includes("mneme_version: 1 # version comment"));
		assert.ok(redirect.includes("# custom YAML comment"));
	}

	for (const extraYaml of [
		"former_mneme_id: [old, other]",
		"merged_into:\n  - concept-a",
		"merged_at: |\n  previous timestamp",
		"redirect_to:\n  target: old",
	]) {
		await assertRedirectPreparationBlocked(extraYaml);
	}
	for (const extraYaml of [
		"mneme_version: 1\nmneme_version: 2",
		"mneme_version: |\n  one\n  two",
		"mneme_version:\n  nested: value",
		"mneme_version:\n- 1\n- 2",
	]) {
		await assertRedirectPreparationBlocked(extraYaml);
	}

	{
		const body = "# Beta\n\n```markdown\nAn example that intentionally has no closing fence.\n\n<!-- an unclosed comment";
		const files = baseFiles("\n", body);
		const vault = new MemoryVault(files);
		const service = new ConceptMergeService(vault, new MemoryStorage(), () => "2026-09-22T10:00:00.000Z", new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") return;
		const redirect = prepared.plan.writes.find((write) => write.path === merged.path)?.after ?? "";
		const noticeIndex = redirect.indexOf("> [!info] Merged Concept");
		const bodyIndex = redirect.indexOf(body);
		assert.ok(noticeIndex >= 0 && noticeIndex < bodyIndex);
		assert.equal(redirect.slice(bodyIndex), body);
	}

	{
		const source = "---\nmneme_type: concept\nmneme_id: concept-b\n---";
		const files = { [survivor.path]: conceptMarkdown(survivor, "\n"), [merged.path]: source };
		const vault = new MemoryVault(files);
		const service = new ConceptMergeService(vault, new MemoryStorage(), () => "2026-09-22T10:00:00.000Z", new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") return;
		const redirect = prepared.plan.writes.find((write) => write.path === merged.path)?.after ?? "";
		assert.equal(redirect.slice(0, redirect.indexOf("\n---\n") + 5),
			"---\nmneme_type: concept_redirect\nformer_mneme_id: concept-b\nmneme_version: 1\nmerged_into: \"concept-a\"\nmerged_at: \"2026-09-22T10:00:00.000Z\"\nredirect_to: \"[[Notes/Alpha|Alpha]]\"\n---\n");
	}

	{
		const files = baseFiles("\n", "# Beta\n\nOriginal body");
		const vault = new MemoryVault(files);
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") return;
		const before = { ...vault.files };
		vault.files[merged.path] += "\nConcurrent edit\n";
		const finalSurvivor = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		assert.equal((await service.execute(prepared.plan, finalSurvivor)).status, "conflict");
		assert.deepEqual(vault.files, { ...before, [merged.path]: `${before[merged.path]}\nConcurrent edit\n` });
		assert.equal(storage.saveCount, 0);
	}

	{
		const files = baseFiles("\n", "# Beta\n\nOriginal body");
		const vault = new MemoryVault(files);
		const storage = new MemoryStorage();
		const service = new ConceptMergeService(vault, storage, undefined, new MemoryGuidedMergeJournal());
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") return;
		storage.failSave = true;
		const before = { ...vault.files };
		const finalSurvivor = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		assert.equal((await service.execute(prepared.plan, finalSurvivor)).status, "failed");
		assert.deepEqual(vault.files, before);
		assert.equal(storage.saveCount, 0);
	}
}

async function assertRedirectPreparationBlocked(extraYaml: string): Promise<void> {
	const files = baseFiles("\n", "# Beta\n\nOriginal body");
	const marker = "# custom YAML comment";
	files[merged.path] = files[merged.path]!.replace(marker, `${extraYaml}\n${marker}`);
	const before = { ...files };
	const storage = new MemoryStorage();
	const prepared = await new ConceptMergeService(new MemoryVault(files), storage, undefined, new MemoryGuidedMergeJournal()).prepare({
		merged,
		preserveMergedAsView: false,
		survivor,
	});
	assert.equal(prepared.status, "blocked", extraYaml);
	assert.deepEqual(files, before);
	assert.equal(storage.saveCount, 0);
}

class MemoryVault implements ConceptMergeVaultAdapter {
	constructor(public files: Record<string, string>) {}

	async exists(path: string): Promise<boolean> { return this.files[path] !== undefined; }
	async listMarkdownFiles(): Promise<Array<{ path: string }>> {
		return Object.keys(this.files).filter((path) => path.endsWith(".md")).map((path) => ({ path }));
	}
	async read(path: string): Promise<string> {
		const value = this.files[path];
		if (value === undefined) throw new Error(`Missing file: ${path}`);
		return value;
	}
	async process(path: string, transform: (current: string) => string | Promise<string>): Promise<void> {
		this.files[path] = await transform(await this.read(path));
	}
}

class MemoryStorage implements ConceptMergeStorage {
	data: MnemePluginData = createDefaultPluginData();
	saveCount = 0;
	failSave = false;

	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: MnemePluginData): Promise<void> {
		if (this.failSave) throw new Error("Injected storage failure");
		this.data = data;
		this.saveCount += 1;
	}
}

function concept(conceptId: string, title: string, path: string): ConceptSummary {
	return { conceptId, coreMeaning: `${title} core`, path, title };
}

function baseFiles(newline: string, body: string): Record<string, string> {
	return {
		[survivor.path]: conceptMarkdown(survivor, newline),
		[merged.path]: sourceMarkdown(newline, body),
	};
}

function conceptMarkdown(conceptSummary: ConceptSummary, newline: string): string {
	return ["---", "mneme_type: concept", `mneme_id: ${conceptSummary.conceptId}`, "---", `# ${conceptSummary.title}`, "", "## Core Meaning", "", `${conceptSummary.title} core`, ""].join(newline);
}

function sourceMarkdown(newline: string, body: string): string {
	return [
		"---",
		"mneme_type: concept",
		`mneme_id: ${merged.conceptId}`,
		"aliases:",
		"  - beta alias",
		"  - second alias",
		"nested:",
		"  owner:",
		"    team: learning",
		"description: |",
		"  A multiline custom value.",
		"# custom YAML comment",
		"---",
		body,
	].join(newline);
}

function readFrontmatter(markdown: string, key: string): string | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	const line = match?.[1]?.split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}:`));
	return line?.slice(key.length + 1).trim().replace(/^"|"$/g, "");
}

export const done = runAsyncTests();
