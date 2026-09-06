import assert from "node:assert/strict";
import { MnemeCardComposerView } from "../src/views/cardComposerView";
import type { ManualCardDraft } from "../src/models/manualCardDraft";
import type { CardDraftType } from "../src/models/knowledgeProposal";
import type { ManualCardResult } from "../src/services/manualCardService";
import { Notice } from "obsidian";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void };

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
	return { promise, resolve, reject };
}

function field(value: string) {
	return {
		value,
		disabled: false,
		addEventListener(): void {},
		dispatchEvent(): void {},
	};
}

function createHarness(overrides: {
	create?: (input: unknown) => Promise<ManualCardResult>;
	clearDraft?: () => Promise<void>;
	listConcepts?: () => Promise<Array<{ conceptId: string; path: string; title: string }>>;
	onCreated?: () => Promise<void>;
} = {}) {
	const concept = { conceptId: "concept-a", path: "Concept.md", title: "Concept A" };
	const draft: ManualCardDraft = {
		back: "Original back",
		cardType: "definition",
		conceptId: concept.conceptId,
		front: "Original front",
		rubric: "Original rubric",
		updatedAt: "2026-09-06T00:00:00.000Z",
	};
	const createCalls: unknown[] = [];
	const clearCalls: number[] = [];
	let renderCalls = 0;
	const view = Object.create(MnemeCardComposerView.prototype) as any;
	Object.assign(view, {
		concepts: [concept],
		createButtonEl: { disabled: false, setText(): void {} },
		createdResultEl: { empty(): void {} },
		showCreatedResult(): void {},
		draft: { ...draft },
		frontEl: field(draft.front),
		backEl: field(draft.back),
		rubricEl: field(draft.rubric),
		cardTypeEl: field(draft.cardType) as { value: CardDraftType; disabled: boolean; addEventListener(): void; dispatchEvent(): void },
		conceptEl: field(draft.conceptId),
		hasRendered: true,
		isReady: true,
		isSaving: false,
		saveQueue: Promise.resolve(),
		markdownComponent: { unload(): void {} },
		contentEl: { empty(): void {}, scrollTo(): void {} },
		options: {
			create: async (input: unknown) => {
				createCalls.push(input);
				return overrides.create ? overrides.create(input) : { cardId: "card-a", cardsPath: "Cards.md", conceptId: concept.conceptId };
			},
			draftStore: {
				saveDraft: async () => {},
				clearDraft: async () => { clearCalls.push(1); await overrides.clearDraft?.(); },
			},
			onCreated: async () => { await overrides.onCreated?.(); },
			listConcepts: async () => overrides.listConcepts ? overrides.listConcepts() : [concept],
		},
		render: () => { renderCalls += 1; },
	});
	return { view, draft, createCalls, clearCalls, get renderCalls() { return renderCalls; } };
}

async function createCard(view: any): Promise<void> {
	await view.createCard();
}

async function run(): Promise<void> {
	{
		const pending = deferred<ManualCardResult>();
		const { view, draft, createCalls } = createHarness({ create: () => pending.promise });
		const creating = createCard(view);
		assert.equal(view.frontEl.disabled, true);
		assert.equal(view.backEl.disabled, true);
		assert.equal(view.conceptEl.disabled, true);
		assert.equal(view.rubricEl.disabled, true);
		assert.equal(view.cardTypeEl.disabled, true);
		pending.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a" });
		await creating;
		assert.deepEqual(createCalls[0], {
			back: draft.back,
			cardType: draft.cardType,
			concept: { conceptId: "concept-a", path: "Concept.md", title: "Concept A" },
			front: draft.front,
			rubric: draft.rubric,
		});
		assert.equal(view.frontEl.value, "");
	}

	{
		const concepts = deferred<Array<{ conceptId: string; path: string; title: string }>>();
		const pendingCreate = deferred<ManualCardResult>();
		const harness = createHarness({
			create: () => pendingCreate.promise,
			listConcepts: () => concepts.promise,
		});
		const preparing = harness.view.prepare("concept-a");
		const creating = createCard(harness.view);
		concepts.resolve([{ conceptId: "concept-a", path: "Concept.md", title: "Concept A" }]);
		await preparing;
		assert.equal(harness.renderCalls, 0, "prepare must not render after creation starts");
		pendingCreate.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a" });
		await creating;
	}

	{
		const concepts = deferred<Array<{ conceptId: string; path: string; title: string }>>();
		const harness = createHarness({ listConcepts: () => concepts.promise });
		const preparing = harness.view.prepare("concept-a");
		const closing = harness.view.onClose();
		concepts.resolve([{ conceptId: "concept-a", path: "Concept.md", title: "Concept A" }]);
		await Promise.all([preparing, closing]);
		assert.equal(harness.renderCalls, 0, "prepare must not render after close");
	}

	{
		const pending = deferred<ManualCardResult>();
		const { view, clearCalls } = createHarness({ create: () => pending.promise });
		const creating = createCard(view);
		const closing = view.onClose();
		pending.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a" });
		await Promise.all([creating, closing]);
		assert.equal(view.draft.front, "");
		assert.ok(clearCalls.length >= 1);
	}

	{
		let created = 0;
		const { view } = createHarness({
			clearDraft: async () => { throw new Error("clear failed"); },
			onCreated: async () => { created += 1; },
		});
		Notice.messages = [];
		await createCard(view);
		assert.equal(created, 1);
		assert.ok(Notice.messages.some((message) => message.includes("draft could not be cleared")));
		assert.ok(Notice.messages.some((message) => message.includes("Card created (card-a)")));
	}

	{
		const { view } = createHarness({ onCreated: async () => { throw new Error("refresh failed"); } });
		Notice.messages = [];
		await createCard(view);
		assert.ok(Notice.messages.some((message) => message.includes("open views could not be refreshed")));
		assert.ok(Notice.messages.some((message) => message.includes("Card created (card-a)")));
	}

	{
		const { view, draft } = createHarness({ create: async () => { throw new Error("write failed"); } });
		await createCard(view);
		assert.equal(view.frontEl.value, draft.front);
		assert.equal(view.backEl.value, draft.back);
		assert.equal(view.draft.front, draft.front);
	}

	console.log("Card Composer lifecycle tests passed.");
}

export const done = run();
