import assert from "node:assert/strict";
import { App, TFile } from "obsidian";
import { ConceptLoader } from "../src/services/conceptLoader";
import { ReviewActionGuard } from "../src/services/reviewActionGuard";
import { buildReviewQueue } from "../src/services/reviewQueueBuilder";
import { MnemeReviewView } from "../src/views/reviewView";
import { parseSimpleFrontmatter } from "../src/services/simpleFrontmatter";
import { yamlFixtures } from "./helpers/obsidianReviewLoaderStub";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import { runPluginDataMutation } from "../src/services/pluginDataMutation";
import type { MnemePluginData } from "../src/models/reviewState";
import type { ReviewScheduleInput } from "../src/models/reviewScheduler";

interface Fixture {
	markdown: Record<string, string>;
	loader: ConceptLoader;
	readErrors: Set<string>;
	missingCache: Set<string>;
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

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

class CountingScheduler extends FsrsReviewScheduler {
	calls = 0;
	schedule(input: ReviewScheduleInput) {
		this.calls += 1;
		return super.schedule(input);
	}
}

class QueueStorage {
	data: MnemePluginData = createDefaultPluginData();
	saveCount = 0;

	async loadData(): Promise<unknown> {
		return structuredClone(this.data);
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.saveCount += 1;
		this.data = structuredClone(data);
	}
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
	const missingCache = new Set<string>();
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
			getFileCache: (file: TFile) => missingCache.has(file.path)
				? undefined : { frontmatter: parseSimpleFrontmatter(markdown[file.path]!) },
			getFirstLinkpathDest: (link: string) => Object.prototype.hasOwnProperty.call(markdown, `${link}.md`) ? makeFile(`${link}.md`) : null,
		},
	} as unknown as App;
	return { markdown, loader: new ConceptLoader(app), readErrors, missingCache };
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
		contentEl: { querySelectorAll: () => [], empty: () => {} },
		render: () => {},
		setReviewActionButtonsDisabled: () => {},
		reviewStateStore: {
			recordReview: async (cardId: string, _rating: "good", options?: { validateBeforeRecord?: () => Promise<void> }) => {
				if (options?.validateBeforeRecord) await options.validateBeforeRecord();
				calls.push(cardId);
				return {};
			},
		},
	});
	return { view, calls };
}

async function run(): Promise<void> {
	for (const change of ["duplicate", "owner-conflict"] as const) {
		const changed = createFixture();
		const harness = await createHarness(changed);
		changed.markdown["New/Uncached.md"] = cardGroupAt("owner-a",
			change === "duplicate" ? "Notes/Owner" : "Notes/Other",
			[change === "duplicate" ? "first" : "third"]);
		changed.markdown["Notes/Other.md"] = concept("owner-a");
		changed.missingCache.add("New/Uncached.md");
		registerYaml(changed.markdown);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, [], `${change}: an uncached custom file must block the stale rating`);
		assert.equal(harness.view.selectedCardIndex, 0);
	}
	{
		const changed = createFixture();
		const harness = await createHarness(changed);
		changed.markdown["Cards.md"] = cardGroup("owner-a").replace("mneme_type: card_group", "mneme_type: card_group\ncard_type: definition");
		changed.missingCache.add("Cards.md");
		registerYaml(changed.markdown);
		await harness.view.rateCurrentCard("good");
		assert.deepEqual(harness.calls, [], "fresh legacy card_type changes must invalidate the displayed snapshot");
	}
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

	{
		for (const [label, mutate] of [
			["owner", (fixture: Fixture) => { fixture.markdown["Cards.md"] = cardGroup("owner-b"); }],
			["back", (fixture: Fixture) => { fixture.markdown["Cards.md"] = cardGroup("owner-a").replace("Answer first", "Changed while rating waits"); }],
			["retention", (fixture: Fixture) => { fixture.markdown["Notes/Owner.md"] = concept("owner-a", "reviewable", "0.8"); }],
			["uncached duplicate", (fixture: Fixture) => {
				fixture.markdown["New/Uncached.md"] = cardGroupAt("owner-a", "Notes/Owner", ["first"]);
				fixture.missingCache.add("New/Uncached.md");
			}],
			["Concept read failure", (fixture: Fixture) => { fixture.readErrors.add("Notes/Owner.md"); }],
		] as const) {
			const changed = createFixture();
			const originalMarkdown = { ...changed.markdown };
			const harness = await createHarness(changed);
			const storage = new QueueStorage();
			const scheduler = new CountingScheduler({ enableFuzz: false });
			const reviews = new ReviewStateStore(storage, scheduler);
			Object.assign(harness.view, { reviewStateStore: reviews });
			const enqueued = deferred();
			const recordReview = reviews.recordReview.bind(reviews);
			reviews.recordReview = async (...args) => {
				const pending = recordReview(...args);
				enqueued.resolve();
				return pending;
			};
			const release = deferred();
			const blocker = runPluginDataMutation(storage, async () => {
				await release.promise;
			});

			const pending = harness.view.rateCurrentCard("good");
			await enqueued.promise;
			mutate(changed);
			registerYaml(changed.markdown);
			release.resolve();
			await Promise.all([pending, blocker]);

			assert.equal(storage.saveCount, 0, `${label}: a queued rating must re-scan before save`);
			assert.equal(scheduler.calls, 0, `${label}: invalid ratings must not reach FSRS`);
			assert.deepEqual(storage.data, createDefaultPluginData(), `${label}: all persisted data remains unchanged`);
			assert.equal(storage.data.reviewStates.first, undefined, `${label}: stale rating must not create state`);
			assert.equal(Object.keys(storage.data.reviewEvents).length, 0, `${label}: stale rating must not create an event`);
			assert.equal(harness.view.selectedCardIndex, 0, `${label}: stale rating must keep the current Card`);
			assert.match(harness.view.statusMessage, /Could not record review/, `${label}: stale rating reports failure`);
			assert.equal(harness.view.actionGuard.isBusy, false);

			for (const path of Object.keys(changed.markdown)) delete changed.markdown[path];
			Object.assign(changed.markdown, originalMarkdown);
			changed.readErrors.clear();
			changed.missingCache.clear();
			registerYaml(changed.markdown);
			await harness.view.rateCurrentCard("good");
			assert.equal(storage.saveCount, 1, `${label}: failed validation releases the queue for retry`);
			assert.equal(scheduler.calls, 1);
			assert.equal(reviews.getState("first")?.reviewCount, 1);
			assert.equal(Object.keys(storage.data.reviewEvents).length, 1);
			assert.equal(harness.view.selectedCardIndex, 1);
		}

		for (const cancel of ["reset", "close", "replace-selection"] as const) {
			const fixture = createFixture();
			const harness = await createHarness(fixture);
			const storage = new QueueStorage();
			const scheduler = new CountingScheduler({ enableFuzz: false });
			const reviews = new ReviewStateStore(storage, scheduler);
			Object.assign(harness.view, { reviewStateStore: reviews });
			const enqueued = deferred();
			const recordReview = reviews.recordReview.bind(reviews);
			reviews.recordReview = async (...args) => {
				const pending = recordReview(...args);
				enqueued.resolve();
				return pending;
			};
			const release = deferred();
			const blocker = runPluginDataMutation(storage, async () => {
				await release.promise;
			});

			const pending = harness.view.rateCurrentCard("good");
			await enqueued.promise;
			const view = harness.view as ReviewHarness & {
				resetReviewState(): void;
				onClose(): Promise<void>;
			};
			if (cancel === "reset") view.resetReviewState();
			else if (cancel === "close") await view.onClose();
			else view.selectedCards = [{ cardId: "replacement" }];
			view.statusMessage = "Replacement session";
			release.resolve();
			await Promise.all([pending, blocker]);

			assert.equal(storage.saveCount, 0, `${cancel}: cancelled queued rating must not save`);
			assert.equal(scheduler.calls, 0, `${cancel}: cancelled ratings must not reach FSRS`);
			assert.deepEqual(storage.data, createDefaultPluginData());
			assert.equal(view.statusMessage, "Replacement session", `${cancel}: old operation must not change replacement UI`);
			assert.equal(view.selectedCardIndex, 0);
			assert.equal(view.actionGuard.isBusy, false);
			assert.equal(storage.data.reviewStates.first, undefined, `${cancel}: cancelled queued rating must not create state`);
			assert.equal(Object.keys(storage.data.reviewEvents).length, 0, `${cancel}: cancelled queued rating must not create an event`);
		}

		const stable = createFixture();
		const stableHarness = await createHarness(stable);
		const stableStorage = new QueueStorage();
		const stableReviews = new ReviewStateStore(stableStorage, new FsrsReviewScheduler({ enableFuzz: false }));
		await stableReviews.load();
		const priorReviews = new ReviewStateStore(stableStorage, new FsrsReviewScheduler({ enableFuzz: false }));
		Object.assign(stableHarness.view, { reviewStateStore: stableReviews });
		const stableRelease = deferred();
		const stableBlocker = runPluginDataMutation(stableStorage, async () => {
			await stableRelease.promise;
		});
		const priorMutation = priorReviews.recordReview("first", "hard");
		const stableRating = stableHarness.view.rateCurrentCard("good");
		stableRelease.resolve();
		await Promise.all([priorMutation, stableRating, stableBlocker]);
		assert.equal(stableStorage.saveCount, 2, "a stable rating after a prior mutation must save once");
		assert.equal(stableStorage.data.reviewStates.first?.reviewCount, 2, "rating must use the preceding mutation's latest state");
		assert.equal(Object.keys(stableStorage.data.reviewEvents).length, 2);
		assert.equal(stableHarness.view.selectedCardIndex, 1);
	}
	console.log("Review rating ownership regression tests passed.");
}

export const done = run();
