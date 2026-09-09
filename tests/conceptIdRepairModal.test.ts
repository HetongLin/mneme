import { RecoverableConceptIdRepair } from "../src/services/recoverableConceptIdRepair";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import type { MnemePluginData } from "../src/models/reviewState";
import assert from "node:assert/strict";
import { ConceptIdRepairModal } from "../src/modals/conceptIdRepairModal";
import { App, Notice, TFile, parseYaml } from "obsidian";
import { yamlFixtures } from "./helpers/obsidianIdentityRepairStub";

async function exercise(mode: "foreign" | "shared" | "collision" | "changed" | "missing" | "valid" | "refresh"): Promise<void> {
	yamlFixtures.clear(); Notice.messages = [];
	const markdown = new Map<string, string>();
	const files = new Map<string, TFile>();
	const add = (path: string, frontmatter: Record<string, string>) => {
		const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join("\n");
		yamlFixtures.set(yaml, frontmatter);
		markdown.set(path, `---\n${yaml}\n---\n# Learner prose\n`);
		files.set(path, Object.assign(new TFile(), { path }));
	};
	add("Concepts/A.md", { mneme_type: "concept", mneme_id: "old-id", cards: mode === "changed" ? "[[Cards/B]]" : "[[Cards/A]]" });
	if (mode !== "missing") add("Cards/A.md", { mneme_type: "card_group", mneme_concept_id: mode === "foreign" ? "foreign-id" : "old-id" });
	if (mode === "shared") add("Concepts/B.md", { mneme_type: "concept", mneme_id: "old-id", cards: "[[Cards/A]]" });
	if (mode === "collision") add("Concepts/B.md", { mneme_type: "concept", mneme_id: "new-id" });
	if (mode === "valid" || mode === "refresh") add("Concepts/B.md", { mneme_type: "concept", mneme_id: "old-id" });
	const before = new Map(markdown);
	let writes = 0, saved = 0;
	const app = Object.assign(new App(), { vault: {
		getAbstractFileByPath: (path: string) => files.get(path),
		getMarkdownFiles: () => [...files.values()],
		read: async (file: TFile) => markdown.get((file as unknown as { path: string }).path),
		cachedRead: async (file: TFile) => markdown.get((file as unknown as { path: string }).path),
		modify: async (file: TFile, content: string) => { writes++; markdown.set((file as unknown as { path: string }).path, content); },
	} });
	let data = createDefaultPluginData();
	const repair = new RecoverableConceptIdRepair({
		readFresh: async (path) => { const text = markdown.get(path); if (text === undefined) throw new Error("Missing Markdown"); return text; },
		listMarkdownFiles: async () => [...files.keys()].map((path) => ({ path })),
		parseFrontmatter: (text) => parseYaml(text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""),
		process: async (path, transform) => { const text = markdown.get(path); if (text === undefined) throw new Error("Missing Markdown"); markdown.set(path, transform(text)); writes++; },
	}, { loadData: async () => structuredClone(data), saveData: async (next: MnemePluginData) => { data = structuredClone(next); } });
	const modal = new ConceptIdRepairModal(app, {
		issue: { kind: "duplicate_id", conceptId: "old-id", path: "Concepts/A.md", cardsPath: "Cards/A.md", title: "A" },
		existingConceptIds: new Set(), // Deliberately stale: the fresh scan must enforce ownership.
		onConfirmed: (newId) => repair.repair({ kind: "duplicate_id", conceptId: "old-id", path: "Concepts/A.md", cardsPath: "Cards/A.md", title: "A" }, newId),
		onSaved: () => { saved++; if (mode === "refresh") throw new Error("refresh failed"); },
	});
	await (modal as unknown as { save(id: string, button: { disabled: boolean }): Promise<void> }).save("new-id", { disabled: false });
	if (mode === "valid" || mode === "refresh") {
		assert.equal(writes, 2); assert.equal(saved, 1);
		assert.match(markdown.get("Cards/A.md")!, /mneme_concept_id: new-id/);
		assert.equal(data.conceptIdRepairs?.["new-id"]?.status, "completed");
		if (mode === "refresh") assert.ok(Notice.messages.some((message) => message.includes("Concept ID saved. Reopen")));
	} else {
		assert.equal(writes, 0, `${mode}: blocked repair must not write any file`);
		assert.equal(saved, 0); assert.deepEqual(markdown, before);
		assert.ok(Notice.messages.length > 0);
	}
}
export const done = (async () => {
	for (const mode of ["foreign", "shared", "collision", "changed", "missing", "valid", "refresh"] as const) await exercise(mode);
	console.log("Concept ID repair modal tests passed.");
})();
