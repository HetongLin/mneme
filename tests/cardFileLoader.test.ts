import assert from "node:assert/strict";
import { App, TFile } from "obsidian";
import { CardFileLoader } from "../src/services/cardFileLoader";
import { yamlFixtures } from "./helpers/obsidianConceptLoaderStub";

type FileSpec = { cacheFrontmatter?: unknown; content: string; name?: string; readError?: Error; yaml?: unknown };
type Harness = { app: App; reads: Map<string, number>; maxInFlight: number };

function card(id: string, cardType?: string): string {
	const type = cardType ? ` type="${cardType}"` : "";
	return `<!-- MNEME:CARD:start id="${id}"${type} -->\n<!-- MNEME:FRONT:start -->\nQuestion ${id}\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer ${id}\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n`;
}

function frontmatter(fields: string, body: string): string {
	return `---\n${fields}\n---\n${body}`;
}

function registerYamlFixtures(content: string, value: unknown): void {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
	if (!match) return;
	const raw = match[1] ?? "";
	yamlFixtures.set(raw, value);
	yamlFixtures.set(raw.replace(/\r\n/g, "\n").replace(/^\uFEFF/, ""), value);
}

function harness(specs: Record<string, FileSpec>): Harness {
	yamlFixtures.clear();
	const files = Object.entries(specs).map(([path, spec]) => Object.assign(new TFile(), {
		path,
		name: spec.name ?? path.split("/").pop()!,
		basename: (spec.name ?? path.split("/").pop()!).replace(/\.md$/, ""),
		extension: "md",
	}));
	const byPath = new Map(files.map((file) => [file.path, file]));
	const reads = new Map<string, number>();
	let inFlight = 0;
	let maxInFlight = 0;
	for (const spec of Object.values(specs)) {
		if (Object.prototype.hasOwnProperty.call(spec, "yaml")) registerYamlFixtures(spec.content, spec.yaml);
	}

	const app = {
		vault: {
			getMarkdownFiles: () => files,
			read: async (file: TFile) => {
				const spec = specs[file.path]!;
				reads.set(file.path, (reads.get(file.path) ?? 0) + 1);
				inFlight += 1;
				maxInFlight = Math.max(maxInFlight, inFlight);
				await Promise.resolve();
				inFlight -= 1;
				if (spec.readError) throw spec.readError;
				return spec.content;
			},
			cachedRead: async () => { throw new Error("cachedRead must not be used by CardFileLoader"); },
			getAbstractFileByPath: (path: string) => byPath.get(path) ?? null,
		},
		metadataCache: {
			getFileCache: (file: TFile) => {
				const spec = specs[file.path]!;
				if (!Object.prototype.hasOwnProperty.call(spec, "cacheFrontmatter")) return undefined;
				return { frontmatter: spec.cacheFrontmatter };
			},
		},
	} as unknown as App;
	return { app, reads, get maxInFlight() { return maxInFlight; } } as Harness;
}

async function run(): Promise<void> {
	{
		const h = harness({ "Notes/Review prompts.md": { content: frontmatter("mneme_type: card_group\nmneme_concept_id: owner", card("fresh-custom")), cacheFrontmatter: { mneme_type: "concept" }, yaml: { mneme_type: "card_group", mneme_concept_id: "owner" } } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.deepEqual(loaded.map((item) => item.cardId), ["fresh-custom"], "current frontmatter must recover a stale negative cache entry");
	}
	{
		const h = harness({ "Notes/Former card.md": { content: frontmatter("mneme_type: concept", card("no-longer-card")), cacheFrontmatter: { mneme_type: "card_group" }, yaml: { mneme_type: "concept" } } });
		assert.deepEqual(await new CardFileLoader(h.app).loadCardFiles(), [], "current non-card frontmatter must override stale cache");
	}
	{
		const h = harness({ "Notes/ordinary.md": { content: card("ordinary-marker") } });
		assert.deepEqual(await new CardFileLoader(h.app).loadCardFiles(), [], "card markers alone must not classify an ordinary note");
	}
	{
		const h = harness({ "Notes/legacy.md": { content: frontmatter("mneme_type: card\ncard_type: definition", card("legacy-card")), cacheFrontmatter: { mneme_type: "card", card_type: "trap" }, yaml: { mneme_type: "card", card_type: "definition" } } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.equal(loaded[0]?.cardType, "definition", "legacy card_type must come from fresh frontmatter");
	}
	{
		const body = card("bom-crlf");
		const content = `\uFEFF---\r\n"mneme_type": "card_group"\r\n"mneme_concept_id": "owner"\r\n---\r\n${body.replace(/\n/g, "\r\n")}`;
		const h = harness({ "Notes/quoted.md": { content, cacheFrontmatter: undefined, yaml: { mneme_type: "card_group", mneme_concept_id: "owner" } } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.deepEqual(loaded.map((item) => item.cardId), ["bom-crlf"]);
	}
	{
		const h = harness({ "Notes/Card.md": { content: card("standard-card") }, "Notes/Cards.md": { content: card("standard-cards") } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.deepEqual(loaded.map((item) => item.cardId).sort(), ["standard-card", "standard-cards"]);
	}
	{
		const h = harness({ "Notes/custom.md": { content: frontmatter("mneme_type: card_group", card("duplicate")), yaml: { mneme_type: "card_group" } }, "Notes/Card.md": { content: card("duplicate") } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.equal(loaded.length, 2);
		assert.equal(loaded.every((item) => !item.isValid && item.errors.some((error) => error.includes("Duplicate card id"))), true);
	}
	{
		const specs: Record<string, FileSpec> = {};
		for (let index = 0; index < 17; index += 1) specs[`Batch/custom-${index}.md`] = { content: frontmatter("mneme_type: card_group", card(`batch-${index}`)), yaml: { mneme_type: "card_group" } };
		specs["Batch/ordinary.md"] = { content: "Unrelated learner notes" };
		const h = harness(specs);
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.equal(loaded.length, 17);
		assert.deepEqual(loaded.map((item) => item.cardId), Array.from({ length: 17 }, (_, index) => `batch-${index}`), "batching preserves enumeration order");
		assert.equal(h.maxInFlight <= 8, true, "reads must be bounded to eight concurrent files");
		assert.equal([...h.reads.values()].every((count) => count === 1), true, "each Markdown file must be read once per scan");
		assert.deepEqual([...h.reads.keys()].sort(), Object.keys(specs).sort(), "every discovered Markdown file must be read");
	}
	{
		const content = frontmatter("mneme_type: [card_group", card("known-parse-error"));
		const h = harness({ "Notes/custom-bad.md": { content, cacheFrontmatter: { mneme_type: "card_group" } } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.equal(loaded.length, 1); assert.equal(loaded[0]?.isValid, false); assert.equal(loaded[0]?.cardId, "known-parse-error"); assert.equal(loaded[0]?.content, content);
	}
	{
		const h = harness({ "Notes/Card.md": { content: frontmatter("- malformed", card("known-nonmapping")), cacheFrontmatter: { mneme_type: "card_group" }, yaml: ["malformed"] } });
		const loaded = await new CardFileLoader(h.app).loadCardFiles();
		assert.equal(loaded.length, 1); assert.equal(loaded[0]?.isValid, false); assert.equal(loaded[0]?.cardId, "known-nonmapping"); assert.equal(loaded[0]?.errors.some((error) => error.includes("YAML mapping")), true);
	}
	{
		const h = harness({ "Notes/ordinary.md": { content: frontmatter("- malformed", card("unknown-malformed")) } });
		assert.deepEqual(await new CardFileLoader(h.app).loadCardFiles(), [], "unknown malformed YAML must remain skipped");
	}
	{
		const known = harness({ "Notes/Card.md": { content: card("known-read-failure"), readError: new Error("read failed") } });
		const loaded = await new CardFileLoader(known.app).loadCardFiles();
		assert.equal(loaded.length, 1); assert.equal(loaded[0]?.isValid, false); assert.equal(loaded[0]?.path, "Notes/Card.md");
		const unknown = harness({ "Notes/ordinary.md": { content: card("unknown-read-failure"), readError: new Error("read failed") } });
		assert.deepEqual(await new CardFileLoader(unknown.app).loadCardFiles(), [], "unknown read failures must remain skipped");
	}
	console.log("Card file loader tests passed.");
}

export const done = run();
