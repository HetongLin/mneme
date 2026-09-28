import assert from "node:assert/strict";
import { App, TFile } from "obsidian";
import { ConceptLoader } from "../src/services/conceptLoader";
import { ConceptScanner } from "../src/services/conceptScanner";
import { attachValidCardCounts } from "../src/services/conceptCardAvailability";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";
import { parseSimpleFrontmatter } from "../src/services/simpleFrontmatter";
import { yamlFixtures } from "./helpers/obsidianConceptLoaderStub";

function card(id: string): string {
	return `<!-- MNEME:CARD:start id=${id} -->\n<!-- MNEME:FRONT:start -->\nQuestion ${id}\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer ${id}\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n`;
}

function group(owner: string, link: string, ...ids: string[]): string {
	return `---\nmneme_type: card_group\nmneme_concept_id: ${owner}\nconcept: "[[${link}]]"\n---\n${ids.map(card).join("\n")}`;
}

function fixture(markdown: Record<string, string>) {
	for (const content of Object.values(markdown)) {
		const yaml = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
		if (yaml !== undefined) yamlFixtures.set(yaml, parseSimpleFrontmatter(content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")));
	}
	const files = Object.keys(markdown).map((path) => Object.assign(new TFile(), {
		path, name: path.split("/").pop()!, basename: path.split("/").pop()!.replace(/\.md$/, ""), extension: "md",
	}));
	const read = async (file: TFile) => markdown[file.path]!;
	const app = {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
			read, cachedRead: read,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: parseSimpleFrontmatter(markdown[file.path]!) }),
			getFirstLinkpathDest: (link: string, _source: string) => files.find((file) => file.path === `${link}.md`) ?? null,
		},
	} as unknown as App;
	return { app, loader: new ConceptLoader(app) };
}

async function run(): Promise<void> {
	for (const reverse of [false, true]) {
		const entries: Array<[string, string]> = [
			["First/Cards.md", group("shared-owner", "Notes/Shared", "first")],
			["Second/Cards.md", group("shared-owner", "Notes/Shared", "second")],
			["Notes/Shared.md", "---\nmneme_type: concept\nmneme_id: shared-owner\nretention_target: 0.91\n---\n# Shared\n"],
		];
		const { loader } = fixture(Object.fromEntries(reverse ? entries.reverse() : entries));
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 1, "One stable owner must not create duplicate cross-folder queue IDs");
		assert.deepEqual(loaded.concepts[0]!.cards.map((c) => c.cardId).sort(), ["first", "second"]);
		assert.equal(buildReviewQueue(loaded.concepts, {}, new Date()).summary.newCards, 2);
	}
	{
		// A bare link belongs to its source context, even when a root file with
		// the same name exists. Identity validation must not reject a valid link
		// because a direct root lookup selected the wrong Concept.
		const { app, loader } = fixture({
			"Local/Cards.md": group("local-owner", "Concept", "local-card"),
			"Local/Concept.md": "---\nmneme_type: concept\nmneme_id: local-owner\n---\n# Local\n",
			"Concept.md": "---\nmneme_type: concept\nmneme_id: other-owner\n---\n# Root\n",
		});
		app.metadataCache.getFirstLinkpathDest = (link, source) => {
			assert.equal(link, "Concept"); assert.equal(source, "Local/Cards.md");
			return app.vault.getAbstractFileByPath("Local/Concept.md") as TFile;
		};
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts[0]!.conceptPath, "Local/Concept.md");
		assert.equal(loaded.concepts[0]!.cards[0]!.isValid, true);
	}
	// Two valid, explicitly linked groups may share a folder. Their Concept
	// learning modes and retention targets must never leak across that folder.
	for (const reverse of [false, true]) {
		const entries: Array<[string, string]> = [
			["Shared/A.md", "---\nmneme_type: concept\nmneme_id: owner-a\ncards: '[[Shared/A-cards]]'\nlearning_mode: exploratory\nretention_target: 0.80\n---\n# Alpha\n"],
			["Shared/B.md", "---\nmneme_type: concept\nmneme_id: owner-b\ncards: '[[Shared/B-cards]]'\nlearning_mode: reviewable\nretention_target: 0.95\n---\n# Beta\n"],
			["Shared/A-cards.md", group("owner-a", "Shared/A", "card-a")],
			["Shared/B-cards.md", group("owner-b", "Shared/B", "card-b", "card-b2")],
		];
		const markdown = Object.fromEntries(reverse ? entries.reverse() : entries);
		const { loader } = fixture(markdown);
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 2, "Distinct explicit owners must not merge by folder");
		const library = await new ConceptScanner({ vault: {
			listMarkdownFiles: async () => Object.keys(markdown).map((path) => ({ path })),
			readMarkdown: async (path) => markdown[path]!,
			getFrontmatter: async (path) => parseSimpleFrontmatter(markdown[path]!),
		} }).scanConcepts();
		const counted = attachValidCardCounts(library, loaded.concepts);
		assert.equal(counted.find((c) => c.conceptId === "owner-a")!.cardCount, 1);
		assert.equal(counted.find((c) => c.conceptId === "owner-b")!.cardCount, 2);
		for (const concept of library) {
			const review = loaded.concepts.find((candidate) => candidate.id === concept.conceptId)!;
			assert.equal(review.conceptPath, concept.path);
			assert.equal(review.cardPath, concept.cardsPath);
			assert.equal(review.title, concept.title);
			assert.equal(review.learningMode, concept.learningMode);
			assert.equal(review.retentionTarget, concept.retentionTarget);
		}
		assert.deepEqual(loaded.concepts.find((c) => c.id === "owner-b")!.cards.map((c) => c.cardId), ["card-b", "card-b2"]);
		const queue = buildReviewQueue(loaded.concepts, {}, new Date("2026-09-27T00:00:00Z"));
		assert.equal(queue.concepts.find((c) => c.conceptId === "owner-a")!.reviewableCount, 0);
		assert.equal(queue.concepts.find((c) => c.conceptId === "owner-b")!.reviewableCount, 2);
		assert.equal(queue.summary.newCards, 2);
	}
	{
		// Preserve the legacy multi-file group alongside an explicit neighbor.
		const { loader } = fixture({
			"Mixed/Concept.md": "---\nlearning_mode: exploratory\n---\n# Legacy\n",
			"Mixed/Card.md": card("legacy-one"),
			"Mixed/Old.md": `---\nmneme_type: card\n---\n${card("legacy-two")}`,
			"Mixed/Modern.md": group("modern", "Notes/Modern", "modern-card"),
			"Notes/Modern.md": "# Modern\n",
		});
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 2);
		const legacy = loaded.concepts.find((c) => c.id === "Mixed")!;
		assert.equal(legacy.conceptPath, "Mixed/Concept.md");
		assert.equal(legacy.title, "Legacy");
		assert.equal(legacy.isReviewable, false);
		assert.deepEqual(legacy.cards.map((c) => c.cardId), ["legacy-one", "legacy-two"]);
		assert.deepEqual(loaded.concepts.find((c) => c.id === "modern")!.cards.map((c) => c.cardId), ["modern-card"]);
	}
	{
		// Same-owner legacy files must produce one entry for ID-keyed consumers.
		const { loader } = fixture({
			"Legacy/One.md": group("same-owner", "Notes/Shared", "same-one").replace("card_group", "card"),
			"Legacy/Two.md": group("same-owner", "Notes/Shared.md|Alias", "same-two").replace("card_group", "card"),
			"Notes/Shared.md": "# Shared\n",
		});
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 1);
		assert.equal(loaded.concepts[0]!.id, "same-owner");
		assert.deepEqual(loaded.concepts[0]!.cards.map((c) => c.cardId), ["same-one", "same-two"]);
	}
	{
		// Missing association keeps the conventional Concept.md fallback, but
		// distinct groups must not collapse into the legacy bucket, even at root.
		const { loader } = fixture({
			"Concept.md": "---\nlearning_mode: exploratory\n---\n# Legacy Root\n",
			"Card.md": card("root-legacy"),
			"One.md": `---\nmneme_type: card_group\n---\n${card("orphan-one")}`,
			"Two.md": `---\nmneme_type: card_group\n---\n${card("orphan-two")}`,
			"IdOnly.md": group("id-only", "", "id-only-card").replace('concept: "[[]]"\n', ""),
			"Missing.md": group("broken-link", "MissingConcept", "broken-link-card"),
		});
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 5);
		assert.equal(new Set(loaded.concepts.map((c) => c.id)).size, 5);
		for (const c of loaded.concepts) {
			assert.equal(c.cards.length, 1);
			assert.equal(c.conceptPath, c.id === "broken-link" ? undefined : "Concept.md");
			assert.equal(c.isReviewable, c.id === "broken-link");
		}
	}
	for (const reverse of [false, true]) {
		// A partial legacy association must not create duplicate stable IDs in
		// the queue/count maps. Prefer the explicit link over folder metadata.
		const entries: Array<[string, string]> = [
			["MixedId/IdOnly.md", group("owner", "", "only-id").replace('concept: "[[]]"\n', "").replace("card_group", "card")],
			["MixedId/Linked.md", group("owner", "Notes/Owner", "linked").replace("card_group", "card")],
			["MixedId/Concept.md", "---\nlearning_mode: exploratory\n---\n# Conventional\n"],
			["Notes/Owner.md", "---\nretention_target: 0.92\n---\n# Owner\n"],
		];
		const { loader } = fixture(Object.fromEntries(reverse ? entries.reverse() : entries));
		const loaded = await loader.loadConcepts();
		assert.equal(loaded.concepts.length, 1, "Same stable owner must produce one queue entry");
		const owner = loaded.concepts[0]!;
		assert.equal(owner.conceptPath, "Notes/Owner.md");
		assert.equal(owner.title, "Owner");
		assert.equal(owner.retentionTarget, 0.92);
		assert.deepEqual(owner.cards.map((c) => c.cardId).sort(), ["linked", "only-id"]);
		assert.equal(buildReviewQueue(loaded.concepts, {}, new Date()).summary.newCards, 2);
	}
	{
		// Missing stable owner IDs still get distinct path-based review entries.
		const markdown = {
			"Cards/First.md": group("", "Notes/First", "duplicate-card"),
			"Cards/Second.md": group("", "Notes/Second", "duplicate-card"),
			"Notes/First.md": "# First\n",
			"Notes/Second.md": "# Second\n",
		};
		const { loader } = fixture(markdown);
		const loaded = await loader.loadConcepts();
		assert.deepEqual(loaded.concepts.map((c) => c.id), ["Cards/First.md", "Cards/Second.md"]);
		assert.equal(loaded.summary.invalidCards, 2, "Splitting owners must retain vault-wide duplicate Card detection");
		assert.equal(buildReviewQueue(loaded.concepts, {}, new Date()).summary.newCards, 0);
	}
	{
		// Link-only compatibility groups in different folders must not acquire
		// the same fallback ID merely because they point at the same note.
		const { loader } = fixture({
			"First/Cards.md": group("", "Notes/Shared", "first"),
			"Second/Cards.md": group("", "Notes/Shared", "second"),
			"Notes/Shared.md": "# Shared\n",
		});
		const loaded = await loader.loadConcepts();
		assert.equal(new Set(loaded.concepts.map((c) => c.id)).size, 2);
	}
	for (const reverse of [false, true]) {
		for (const hasResolvedLink of [false, true]) {
			const entries: Array<[string, string]> = [
				["Stale/Broken.md", group("owner", "Gone", "broken")],
				["Stale/Other.md", hasResolvedLink
					? group("owner", "Notes/Resolved", "other")
					: group("owner", "", "other").replace('concept: "[[]]"\n', "")],
				["Stale/Concept.md", "# Conventional\n"],
				["Notes/Resolved.md", "---\nlearning_mode: exploratory\nretention_target: 0.85\n---\n# Resolved\n"],
			];
			const { loader } = fixture(Object.fromEntries(reverse ? entries.reverse() : entries));
			const loaded = await loader.loadConcepts();
			assert.equal(loaded.concepts.length, 1);
			const owner = loaded.concepts[0]!;
			assert.equal(owner.conceptPath, hasResolvedLink ? "Notes/Resolved.md" : undefined);
			assert.equal(owner.isReviewable, !hasResolvedLink);
			assert.equal(owner.retentionTarget, hasResolvedLink ? 0.85 : undefined);
		}
	}
	console.log("Concept loader ownership tests passed.");
}

export const done = run();
