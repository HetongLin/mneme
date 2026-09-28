import assert from "node:assert/strict";
import { App, TFile } from "obsidian";
import { ConceptLoader } from "../src/services/conceptLoader";
import { waitForReviewableConcept } from "../src/services/conceptReviewAvailability";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";
import { parseSimpleFrontmatter } from "../src/services/simpleFrontmatter";
import { yamlFixtures } from "./helpers/obsidianConceptLoaderStub";

function card(id: string): string {
	return `<!-- MNEME:CARD:start id=${id} -->\n<!-- MNEME:FRONT:start -->\nQuestion ${id}\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer ${id}\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n`;
}

function group(owner: string, link: string, ...ids: string[]): string {
	const identity = owner ? `mneme_concept_id: ${owner}\n` : "";
	const association = link ? `concept: \"[[${link}]]\"\n` : "";
	return `---\nmneme_type: card_group\n${identity}${association}---\n${ids.map(card).join("\n")}`;
}

interface FixtureOptions {
	staleCachedRead?: Record<string, string>;
	staleMetadata?: Record<string, string>;
	readErrors?: Set<string>;
	registerYaml?: Set<string>;
}

function fixture(markdown: Record<string, string>, options: FixtureOptions = {}) {
	yamlFixtures.clear();
	const registerYaml = options.registerYaml ?? new Set(Object.keys(markdown));
	for (const [path, content] of Object.entries(markdown)) {
		const yaml = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
		if (yaml !== undefined && registerYaml.has(path)) {
			yamlFixtures.set(yaml, parseSimpleFrontmatter(content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")));
		}
	}
	const files = Object.keys(markdown).map((path) => Object.assign(new TFile(), {
		path,
		name: path.split("/").pop()!,
		basename: path.split("/").pop()!.replace(/\.md$/, ""),
		extension: "md",
	}));
	const read = async (file: TFile) => {
		if (options.readErrors?.has(file.path)) throw new Error(`read failed for ${file.path}`);
		return markdown[file.path]!;
	};
	const cachedRead = async (file: TFile) => options.staleCachedRead?.[file.path] ?? read(file);
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
			read,
			cachedRead,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: parseSimpleFrontmatter(options.staleMetadata?.[file.path] ?? markdown[file.path]!) }),
			getFirstLinkpathDest: (link: string) => files.find((file) => file.path === `${link}.md`) ?? null,
		},
	} as unknown as App;
	return { app, loader: new ConceptLoader(app) };
}

function conceptFile(id: string, mode = "reviewable", retention = "0.91"): string {
	return `---\nmneme_type: concept\nmneme_id: ${id}\nlearning_mode: ${mode}\nretention_target: ${retention}\n---\n# ${id}\n`;
}

async function run(): Promise<void> {
	for (const reverse of [false, true]) {
		const entries: Array<[string, string]> = [
			["First/Cards.md", group("shared-owner", "Notes/First", "first")],
			["Second/Cards.md", group("shared-owner", "Notes/Second", "second")],
			["Notes/First.md", conceptFile("shared-owner")],
			["Notes/Second.md", conceptFile("shared-owner")],
		];
		const markdown = Object.fromEntries(reverse ? entries.reverse() : entries);
		const { loader } = fixture(markdown);
		const loaded = await loader.loadConcepts();
		const conflict = loaded.concepts.find((concept) => concept.id === "shared-owner")!;
		assert.equal(loaded.concepts.length, 1);
		assert.equal(conflict.cards.length, 2);
		assert.equal(conflict.cards.every((candidate) => !candidate.isValid), true);
		assert.match(conflict.errors.join("\n"), /Conflicting Concept paths/);
		assert.equal(conflict.conceptPath, undefined);
		assert.deepEqual(conflict.cards.map((candidate) => candidate.cardId).sort(), ["first", "second"]);
		assert.ok(conflict.cards.every((candidate) => candidate.content === markdown[candidate.path]));
		assert.equal(loaded.summary.invalidCards, 2);
		const queue = buildReviewQueue(loaded.concepts, {}, new Date());
		assert.equal(queue.summary.invalidCards, 2);
		assert.equal(queue.summary.newCards, 0);
		assert.equal(await waitForReviewableConcept(async () => loaded.concepts, "shared-owner", { attempts: 2, delayMs: 0, sleep: async () => undefined }), false);
	}

	{
		const { loader } = fixture({
			"Cards.md": group("declared-owner", "Notes/Owner", "mismatch-a", "mismatch-b"),
			"Notes/Owner.md": conceptFile("actual-owner"),
		});
		const loaded = await loader.loadConcepts();
		const concept = loaded.concepts[0]!;
		assert.equal(concept.cards.length, 2);
		assert.equal(concept.cards.every((candidate) => !candidate.isValid), true);
		assert.match(concept.errors.join("\n"), /conflicts with Concept ID actual-owner/);
		assert.deepEqual(concept.cards.map((candidate) => [candidate.cardId, candidate.content.includes("Question")]), [["mismatch-a", true], ["mismatch-b", true]]);
	}

	{
		const { loader } = fixture({
			"One/Cards.md": group("same-owner", "", "one"),
			"Two/Cards.md": group("same-owner", "", "two"),
			"One/Concept.md": conceptFile("same-owner"),
			"Two/Concept.md": conceptFile("same-owner"),
		});
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 1);
		assert.equal(loaded.concepts[0]!.cards.every((candidate) => !candidate.isValid), true);
		assert.match(loaded.concepts[0]!.errors.join("\n"), /Conflicting Concept paths/);
	}

	{
		const { loader } = fixture({
			"Broken/Cards.md": group("broken-owner", "Notes/A", "broken"),
			"Notes/A.md": conceptFile("different-owner"),
			"Good/Cards.md": group("good-owner", "Notes/Good", "good"),
			"Notes/Good.md": conceptFile("good-owner"),
		});
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.find((concept) => concept.id === "broken-owner")!.cards[0]!.isValid, false);
		assert.equal(loaded.concepts.find((concept) => concept.id === "good-owner")!.isReviewable, true);
		assert.equal(loaded.concepts.find((concept) => concept.id === "good-owner")!.cards[0]!.isValid, true);
	}

	{
		const markdown: Record<string, string> = {
			"First/Cards.md": group("owner", "Notes/Owner", "first"),
			"Second/Cards.md": group("owner", "Notes/Other", "second"),
			"Notes/Owner.md": conceptFile("owner", "reviewable", "0.80"),
			"Notes/Other.md": conceptFile("owner", "exploratory", "0.95"),
		};
		const { loader } = fixture(markdown);
		const before = await loader.loadConcepts();
		assert.equal(before.concepts[0]!.isReviewable, false);
		markdown["Second/Cards.md"] = group("owner", "Notes/Owner", "second");
		const after = await loader.loadConcepts();
		assert.equal(after.concepts.length, 1);
		assert.equal(after.concepts[0]!.isReviewable, true);
		assert.equal(after.concepts[0]!.conceptPath, "Notes/Owner.md");
		assert.equal(after.concepts[0]!.retentionTarget, 0.8);
		assert.deepEqual(after.concepts[0]!.cards.map((candidate) => candidate.cardId).sort(), ["first", "second"]);
	}

	{
		const currentCard = group("current-owner", "Notes/Current", "fresh-card");
		const { loader } = fixture({
			"Cards.md": currentCard,
			"Notes/Current.md": conceptFile("current-owner"),
		}, { staleMetadata: { "Cards.md": group("stale-owner", "Notes/Stale", "fresh-card") } });
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts[0]!.id, "current-owner");
		assert.equal(loaded.concepts[0]!.isReviewable, true);
	}

	{
		const currentConcept = conceptFile("fresh-owner", "reviewable", "0.88");
		const { loader } = fixture({
			"Cards.md": group("fresh-owner", "Notes/Owner", "fresh-policy"),
			"Notes/Owner.md": currentConcept,
		}, { staleCachedRead: { "Notes/Owner.md": conceptFile("stale-owner", "exploratory", "0.10") } });
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts[0]!.isReviewable, true);
		assert.equal(loaded.concepts[0]!.retentionTarget, 0.88);
		assert.equal(loaded.concepts[0]!.id, "fresh-owner");
	}

	{
		const markdown = {
			"Cards.md": group("owner", "Notes/Owner", "parse-failure"),
			"Notes/Owner.md": conceptFile("owner"),
		};
		const { loader } = fixture(markdown, { registerYaml: new Set(["Notes/Owner.md"]) });
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.summary.scannedCards, 1);
		assert.equal(loaded.summary.invalidCards, 1);
		assert.equal(loaded.concepts[0]!.cards[0]!.cardId, "parse-failure");
		assert.match(loaded.concepts[0]!.errors.join("\n"), /Cannot read Card ownership/);
	}

	{
		const { loader } = fixture({
			"Cards.md": group("owner", "Notes/Owner", "read-failure"),
			"Notes/Owner.md": conceptFile("owner"),
		}, { readErrors: new Set(["Notes/Owner.md"]) });
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.summary.invalidCards, 1);
		assert.equal(loaded.concepts[0]!.cards[0]!.cardId, "read-failure");
		assert.equal(loaded.concepts[0]!.isReviewable, false);
		assert.match(loaded.concepts[0]!.errors.join("\n"), /Cannot verify Concept ownership/);
	}

	for (const path of ["Cards.md", "Notes/Owner.md"]) {
		const markdown = {
			"Cards.md": group("owner", "Notes/Owner", "non-mapping"),
			"Notes/Owner.md": conceptFile("owner"),
		};
		const { loader } = fixture(markdown);
		const yaml = /^---\n([\s\S]*?)\n---/.exec(markdown[path as keyof typeof markdown])![1]!;
		yamlFixtures.set(yaml, ["invalid mapping"]);
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.summary.invalidCards, 1);
		assert.match(loaded.concepts[0]!.errors.join("\n"), /YAML mapping/);
	}

	console.log("Concept owner conflict regression tests passed.");
}

export const done = run();
