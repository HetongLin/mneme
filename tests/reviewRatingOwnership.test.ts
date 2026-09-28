import assert from "node:assert/strict";
import { App, TFile } from "obsidian";
import { ConceptLoader } from "../src/services/conceptLoader";
import { ReviewActionGuard } from "../src/services/reviewActionGuard";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";
import { MnemeReviewView } from "../src/views/reviewView";
import { parseSimpleFrontmatter } from "../src/services/simpleFrontmatter";
import { yamlFixtures } from "./helpers/obsidianReviewLoaderStub";

interface Fixture {
	markdown: Record<string, string>;
	loader: ConceptLoader;
	readErrors: Set<string>;
}

interface ReviewHarness {
	loader: ConceptLoader;
	actionGuard: ReviewActionGuard;
	selectedCardIndex: number;
	selectedCards: unknown[];
	selectedConcept: unknown;
	statusMessage: string;
	rateCurrentCard(rating: "good"): Promise<void>;
}

function card(id: string): string {
	return `<!-- MNEME:CARD:start id=${id} -->\n<!-- MNEME:FRONT:start -->\nQuestion ${id}\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer ${id}\n<!-- MNEME:BACK:end -->\n<!-- MNEME:CARD:end -->\n`;
}

function cardGroup(owner: string): string {
	return cardGroupAt(owner, "Notes/Owner", ["first", "second"]);
}

function cardGroupAt(owner: string, conceptPath: string, ids: string[]): string {
	return `---\nmneme_type: card_group\nmneme_concept_id: ${owner}\nconcept: "[[${conceptPath}]]"\n---\n${ids.map((id) => card(id)).join("\n")}`;
}

function concept(owner: string, learningMode = "reviewable", retention = "0.9"): string {
	return `---\nmneme_type: concept\nmneme_id: ${owner}\nlearning_mode: ${learningMode}\nretention_target: ${retention}\n---\n# Owner\n`;
}

function createFixture(initialMarkdown?: Record<string, string>): Fixture {
	const markdown = initialMarkdown ?? {
		"Cards.md": cardGroup("owner-a"),
		"Notes/Owner.md": concept("owner-a"),
	};
	const readErrors = new Set<string>();
	registerYaml(markdown);
	const makeFile = (path: string) => Object.assign(new TFile(), {
		path,
		name: path.split("/").pop()!,
		basename: path.split("/").pop()!.replace(/\.md$/, ""),
		extension: "md",
	});
	const app = {
		vault: {
			getMarkdownFiles: () => Object.keys(markdown).map(makeFile),
			getAbstractFileByPath: (path: string) => Object.prototype.hasOwnProperty.call(markdown, path) ? makeFile(path) : null,
			read: async (file: TFile) => {
				if (readErrors.has(file.path)) throw new Error(`read failed for ${file.path}`);
				return markdown[file.path]!;
			},
			cachedRead: async (file: TFile) => markdown[file.path]!,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: parseSimpleFrontmatter(markdown[file.path]!) }),
			getFirstLinkpathDest: (link: string) => Object.prototype.hasOwnProperty.call(markdown, `${link}.md`) ? makeFile(`${link}.md`) : null,
		},
	} as unknown as App;
	return { markdown, loader: new ConceptLoader(app), readErrors };
}

function registerYaml(markdown: Record<string, string>): void {
	yamlFixtures.clear();
	for (const content of Object.values(markdown)) {
		const match = /^---\n([\s\S]*?)\n---/.exec(content);
		if (match) yamlFixtures.set(match[1]!, parseSimpleFrontmatter(content));
	}
}

async function createHarness(fixture: Fixture): Promise<{ view: ReviewHarness; calls: string[] }> {
	const loaded = await fixture.loader.loadConcepts();
	const queue = buildReviewQueue(loaded.concepts, {}, new Date());
	const selectedConcept = queue.concepts[0]!;
	const calls: string[] = [];
	const view = Object.create(MnemeReviewView.prototype) as ReviewHarness;
	Object.assign(view, {
		loader: fixture.loader,
		actionGuard: new ReviewActionGuard(),
		selectedCardIndex: 0,
		selectedCards: [...selectedConcept.newCards],
		selectedConcept,
		mode: "flashcard",
		activeRetirements: {},
		activeSuspensions: {},
		contentEl: { querySelectorAll: () => [] },
		render: () => {},
		setReviewActionButtonsDisabled: () => {},
		reviewStateStore: {
			recordReview: async (cardId: string) => {
				calls.push(cardId);
				return {};
			},
		},
	});
	return { view, calls };
}

async function run(): Promise<void> {
	const fixture = createFixture();
	const { view, calls } = await createHarness(fixture);
	fixture.markdown["Cards.md"] = cardGroup("owner-b");
	registerYaml(fixture.markdown);
	const changedOwner = await fixture.loader.loadConcepts();
	assert.equal(changedOwner.concepts[0]!.id, "owner-b", "fresh loader must observe the changed Card owner");
	assert.equal(changedOwner.concepts[0]!.cards[0]!.isValid, false, "fresh loader must diagnose the ownership conflict");

	await view.rateCurrentCard("good");

	assert.deepEqual(calls, [], "rating must not persist after Card ownership changes");
	assert.equal(view.selectedCardIndex, 0, "ownership failure must keep the current Card in place");
	assert.match(view.statusMessage, /Could not record review/);

	{
		const stableFixture = createFixture();
		const stable = await createHarness(stableFixture);
		await stable.view.rateCurrentCard("good");
		assert.deepEqual(stable.calls, ["first"], "unchanged Card should record exactly once");
		assert.equal(stable.view.selectedCardIndex, 1, "successful rating advances one position");
	}

	{
		const crossFolder = createFixture({
			"First/Cards.md": cardGroupAt("owner-a", "Notes/Owner", ["first", "second"]),
			"Second/Cards.md": cardGroupAt("owner-a", "Notes/Owner", ["third", "fourth"]),
			"Notes/Owner.md": concept("owner-a"),
		});
		const stable = await createHarness(crossFolder);
		assert.equal(stable.view.selectedCards.length, 4, "same owner across folders stays one session");
		await stable.view.rateCurrentCard("good");
		assert.deepEqual(stable.calls, ["first"]);
	}

	{
		const conflict = createFixture({
			"First/Cards.md": cardGroupAt("owner-a", "Notes/Owner", ["first", "second"]),
			"Second/Cards.md": cardGroupAt("owner-a", "Notes/Owner", ["third", "fourth"]),
			"Notes/Owner.md": concept("owner-a"),
			"Notes/Other.md": concept("owner-a"),
		});
		const harness = await createHarness(conflict);
		conflict.markdown["Second/Cards.md"] = cardGroupAt("owner-a", "Notes/Other", ["third", "fourth"]);
		registerYaml(conflict.markdown);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, [], "multiple explicit Concept paths block rating");
	}

	for (const mutate of [
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroup("owner-b"); },
		(markdown: Record<string, string>) => { markdown["Notes/Owner.md"] = concept("owner-b"); },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroupAt("owner-a", "Notes/Owner", ["second"]); },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = `${cardGroup("owner-a")}\n${card("first")}`; },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroup("owner-a").replace("Question first", "Changed question first"); },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroup("owner-a").replace("Answer first", "Changed answer first"); },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroup("owner-a").replace("<!-- MNEME:BACK:end -->", "<!-- MNEME:BACK:end -->\n<!-- MNEME:RUBRIC:start -->\nChanged rubric\n<!-- MNEME:RUBRIC:end -->"); },
		(markdown: Record<string, string>) => { markdown["Cards.md"] = cardGroup("owner-a").replace("id=first -->", "id=first type=\"definition\" -->"); },
		(markdown: Record<string, string>) => { markdown["Moved/Cards.md"] = markdown["Cards.md"]!; delete markdown["Cards.md"]; },
		(markdown: Record<string, string>) => { markdown["Notes/Owner.md"] = concept("owner-a").replace("retention_target: 0.9", "retention_target: 0.8"); },
		(markdown: Record<string, string>) => { markdown["Notes/Owner.md"] = concept("owner-a", "exploratory"); },
	]) {
		const changed = createFixture();
		const harness = await createHarness(changed);
		mutate(changed.markdown);
		registerYaml(changed.markdown);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, [], "changed ownership or Card snapshot must not record");
		assert.equal(harness.view.selectedCardIndex, 0, "blocked rating keeps position");
		assert.match(harness.view.statusMessage, /Could not record review/);
	}

	{
		const sibling = createFixture();
		const harness = await createHarness(sibling);
		sibling.markdown["Cards.md"] = cardGroup("owner-a").replace("Answer second", "Changed sibling answer");
		registerYaml(sibling.markdown);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, ["first"], "editing a sibling Card does not invalidate the current Card");
	}

	{
		const exploratory = createFixture({
			"Cards.md": cardGroup("owner-a"),
			"Notes/Owner.md": concept("owner-a", "exploratory"),
		});
		const loaded = await exploratory.loader.loadConcepts();
		const queue = buildReviewQueue(loaded.concepts, {}, new Date());
		const harness = await createHarness(exploratory);
		(harness.view as ReviewHarness & { startFlashCards(concept: unknown, source: "concept-library"): void }).startFlashCards(queue.concepts[0]!, "concept-library");
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, ["first"], "manual exploratory review remains rateable");
	}

	{
		const broken = createFixture();
		const harness = await createHarness(broken);
		broken.readErrors.add("Notes/Owner.md");
		registerYaml(broken.markdown);
		const failedRead = await broken.loader.loadConcepts();
		assert.match(failedRead.concepts[0]!.errors.join("\n"), /Cannot verify Concept ownership/);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, [], "Concept policy read failure blocks rating");
	}

	{
		const repaired = createFixture();
		const oldSession = await createHarness(repaired);
		repaired.markdown["Cards.md"] = cardGroup("owner-b");
		registerYaml(repaired.markdown);
		await oldSession.view.rateCurrentCard("good");
		assert.deepEqual(oldSession.calls, []);
		repaired.markdown["Cards.md"] = cardGroup("owner-a");
		registerYaml(repaired.markdown);
		const newSession = await createHarness(repaired);
		await newSession.view.rateCurrentCard("good");
		assert.deepEqual(newSession.calls, ["first"], "a fresh session after repair can rate normally");
	}
	console.log("Review rating ownership regression tests passed.");
}

export const done = run();
