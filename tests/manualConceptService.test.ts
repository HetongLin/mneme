import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import { createManualConcept } from "../src/services/manualConceptService";

class MemoryVault {
	files = new Map<string, string>();
	folders = new Set<string>();

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error("exists");
		this.files.set(path, content);
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}
}

async function run(): Promise<void> {
	const vault = new MemoryVault();
	const first = await createManualConcept({
		coreMeaning: "向量空间对向量加法和标量乘法封闭。",
		importance: "high",
		learningMode: "reviewable",
		tags: ["线性代数", "Linear Algebra"],
		title: "向量空间",
	}, DEFAULT_SETTINGS, vault, () => "concept_manual_one");
	const markdown = vault.files.get(first.path) ?? "";

	assert.equal(first.path, "Mneme/Concepts/向量空间.md");
	assert.match(markdown, /mneme_id: concept_manual_one/);
	assert.match(markdown, /cards: "\[\[Mneme\/Cards\/向量空间\/Cards\|向量空间 Cards\]\]"/);
	assert.match(markdown, /tags: \[线性代数, linear-algebra\]/);
	assert.equal(markdown.includes("Source Notes"), false);
	assert.equal(markdown.includes("Add views here"), false);

	const second = await createManualConcept({
		coreMeaning: "A separate user-authored Concept.",
		title: "向量空间",
	}, DEFAULT_SETTINGS, vault, () => "concept_manual_two");
	assert.equal(second.path, "Mneme/Concepts/向量空间-2.md");
	assert.match(vault.files.get(second.path) ?? "", /cards: "\[\[Mneme\/Cards\/向量空间-2\/Cards\|向量空间 Cards\]\]"/);

	await assert.rejects(
		createManualConcept({ coreMeaning: "", title: "Empty" }, DEFAULT_SETTINGS, vault),
		/Core Meaning is required/,
	);
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
