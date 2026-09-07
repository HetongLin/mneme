import assert from "node:assert/strict";
import { MnemeCardComposerView } from "../src/views/cardComposerView";
import type { ManualCardDraft } from "../src/models/manualCardDraft";
import type { CardDraftType } from "../src/models/knowledgeProposal";
import { createEmptyManualCardDraft } from "../src/models/manualCardDraft";
import type { ManualCardCreationResult } from "../src/services/manualCardWriteService";
import type { ManualCardWriteReceipt } from "../src/models/manualCardWrite";
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
	create?: (draft: ManualCardDraft, concept?: { conceptId: string; path: string; title: string }) => Promise<ManualCardCreationResult>;
	clearDraft?: () => Promise<void>;
	pendingWrite?: ManualCardWriteReceipt;
	getState?: () => Promise<{ draft: ManualCardDraft; pendingWrite?: ManualCardWriteReceipt }>;
	saveDraft?: (draft: ManualCardDraft) => Promise<void>;
	listConcepts?: () => Promise<Array<{ conceptId: string; path: string; title: string }>>;
	onCreated?: () => Promise<void>;
} = {}) {
	const concept = { conceptId: "concept-a", path: "Concept.md", title: "Concept A" };
	const draft: ManualCardDraft = {
		draftId: "draft-a",
		back: "Original back",
		cardType: "definition",
		conceptId: concept.conceptId,
		front: "Original front",
		rubric: "Original rubric",
		updatedAt: "2026-09-06T00:00:00.000Z",
	};
	const createCalls: unknown[] = [];
	const clearCalls: number[] = [];
	const saveCalls: ManualCardDraft[] = [];
	let renderCalls = 0;
	const view = Object.create(MnemeCardComposerView.prototype) as any;
	Object.assign(view, {
		concepts: [concept],
		createButtonEl: { disabled: false, text: "", setText(value: string): void { this.text = value; } },
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
		lifecycleToken: 0,
		saveQueue: Promise.resolve(),
		markdownComponent: { load(): void {}, unload(): void {} },
		contentEl: { addClass(): void {}, empty(): void {}, scrollTo(): void {} },
		options: {
			create: async (input: ManualCardDraft, selectedConcept?: typeof concept) => {
				createCalls.push({ draft: input, concept: selectedConcept });
				return overrides.create ? overrides.create(input, selectedConcept) : { cardId: "card-a", cardsPath: "Cards.md", conceptId: concept.conceptId, nextDraft: createEmptyManualCardDraft(concept.conceptId, "2026-09-06T00:00:01.000Z", "draft-next") };
			},
			draftStore: {
				saveDraft: async (nextDraft: ManualCardDraft) => { saveCalls.push(nextDraft); await overrides.saveDraft?.(nextDraft); },
				clearDraft: async () => { clearCalls.push(1); await overrides.clearDraft?.(); },
				getState: async () => overrides.getState ? overrides.getState() : { draft: { ...draft }, ...(overrides.pendingWrite ? { pendingWrite: overrides.pendingWrite } : {}) },
			},
			onCreated: async () => { await overrides.onCreated?.(); },
			listConcepts: async () => overrides.listConcepts ? overrides.listConcepts() : [concept],
		},
		render: () => {
			renderCalls += 1;
			view.frontEl.value = view.draft.front;
			view.backEl.value = view.draft.back;
			view.rubricEl.value = view.draft.rubric;
			view.conceptEl.value = view.draft.conceptId ?? "";
			view.cardTypeEl.value = view.draft.cardType;
			view.updateControls();
		},
	});
	return { view, draft, createCalls, clearCalls, saveCalls, get renderCalls() { return renderCalls; } };
}

async function createCard(view: any): Promise<void> {
	await view.createCard();
}

async function run(): Promise<void> {
	{
		const pending = deferred<ManualCardCreationResult>();
		const { view, draft, createCalls } = createHarness({ create: () => pending.promise });
		const creating = createCard(view);
		assert.equal(view.frontEl.disabled, true);
		assert.equal(view.backEl.disabled, true);
		assert.equal(view.conceptEl.disabled, true);
		assert.equal(view.rubricEl.disabled, true);
		assert.equal(view.cardTypeEl.disabled, true);
		assert.equal(view.createButtonEl.disabled, true, "submit is disabled during pending creation");
		pending.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a", nextDraft: createEmptyManualCardDraft("concept-a", undefined, "draft-next") });
		await creating;
		assert.deepEqual(createCalls[0], {
			draft: { ...draft, updatedAt: (createCalls[0] as { draft: ManualCardDraft }).draft.updatedAt },
			concept: { conceptId: "concept-a", path: "Concept.md", title: "Concept A" },
		});
		assert.equal(view.draft.front, "", "successful recovery returns the next empty draft");
	}

	{
		const receipt: ManualCardWriteReceipt = {
			afterHash: "after", cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a",
			conceptPath: "Concept.md", conceptTitle: "Concept A", createdAt: "2026-09-06T00:00:00.000Z",
			draftId: "draft-a", inputHash: "input", status: "pending", targetExisted: true, version: 1,
		};
		const harness = createHarness({ pendingWrite: receipt });
		harness.view.concepts = [];
		harness.view.pendingWrite = receipt;
		const creating = createCard(harness.view);
		assert.equal(harness.view.createButtonEl.disabled, true, "Resume is disabled while writing");
		await creating;
		assert.equal((harness.createCalls[0] as { concept?: unknown }).concept, undefined, "pending creation resumes without a loaded Concept");
		assert.equal(harness.saveCalls.length, 0);
	}

	{
		const concepts = deferred<Array<{ conceptId: string; path: string; title: string }>>();
		const pendingCreate = deferred<ManualCardCreationResult>();
		const harness = createHarness({
			create: () => pendingCreate.promise,
			listConcepts: () => concepts.promise,
		});
		const preparing = harness.view.prepare("concept-a");
		const creating = createCard(harness.view);
		concepts.resolve([{ conceptId: "concept-a", path: "Concept.md", title: "Concept A" }]);
		await preparing;
		assert.equal(harness.renderCalls, 0, "prepare must not render after creation starts");
		pendingCreate.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a", nextDraft: createEmptyManualCardDraft("concept-a", undefined, "draft-next") });
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
		const pending = deferred<ManualCardCreationResult>();
		const { view, clearCalls } = createHarness({ create: () => pending.promise });
		const creating = createCard(view);
		const closing = view.onClose();
		pending.resolve({ cardId: "card-a", cardsPath: "Cards.md", conceptId: "concept-a", nextDraft: createEmptyManualCardDraft("concept-a", undefined, "draft-next") });
		await Promise.all([creating, closing]);
		assert.equal(view.draft.front, "");
		assert.equal(clearCalls.length, 0, "successful recovery service owns draft cleanup");
	}

	{
		let created = 0;
		const { view, clearCalls } = createHarness({
			onCreated: async () => { created += 1; },
		});
		Notice.messages = [];
		await createCard(view);
		assert.equal(created, 1);
		assert.equal(clearCalls.length, 0, "creation service owns successful draft cleanup");
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

	{
		const receipt = { draftId: "draft-a", cardsPath: "Cards.md" } as ManualCardWriteReceipt;
		const harness = createHarness({ pendingWrite: receipt, create: async () => { throw new Error("resume failed"); } });
		harness.view.pendingWrite = receipt;
		await createCard(harness.view);
		assert.equal(harness.view.frontEl.disabled, true);
		assert.equal(harness.view.createButtonEl.disabled, false, "Resume Creation remains clickable");
		assert.equal(harness.view.createButtonEl.text, "Resume Creation");
		assert.equal(harness.clearCalls.length, 0);
		assert.equal(harness.saveCalls.length, 0);
	}

	{
		const harness = createHarness({ getState: async () => { throw new Error("state unavailable"); }, create: async () => { throw new Error("write failed"); } });
		await createCard(harness.view);
		assert.equal(harness.view.frontEl.disabled, true);
		assert.equal(harness.view.createButtonEl.disabled, true);
	}

	{
		const harness = createHarness({ saveDraft: async () => { throw new Error("save failed"); } });
		harness.view.frontEl.value = "Unsaved latest front";
		harness.view.backEl.value = "Unsaved latest back";
		await createCard(harness.view);
		assert.equal(harness.view.frontEl.value, "Unsaved latest front", "failed flush keeps local front");
		assert.equal(harness.view.backEl.value, "Unsaved latest back", "failed flush keeps local back");
		assert.equal(harness.createCalls.length, 0);
	}

	{
		const harness = createHarness({ getState: async () => { throw new Error("state unavailable"); } });
		harness.view.isReady = false;
		await harness.view.onOpen();
		assert.equal(harness.view.frontEl.disabled, true);
		await harness.view.onClose();
		assert.equal(harness.clearCalls.length, 0, "failed load must not clear the draft");
		assert.equal(harness.saveCalls.length, 0);
	}

	{
		const state = deferred<{ draft: ManualCardDraft; pendingWrite?: ManualCardWriteReceipt }>();
		const loading = deferred<void>();
		const harness = createHarness({ getState: () => { loading.resolve(); return state.promise; } });
		harness.view.isReady = false;
		const opening = harness.view.onOpen();
		await loading.promise;
		const closing = harness.view.onClose();
		state.resolve({ draft: { ...harness.draft } });
		await Promise.all([opening, closing]);
		assert.equal(harness.renderCalls, 0, "late onOpen must not render after close");
	}

	{
		const harness = createHarness();
		harness.view.frontEl.value = "Typed before the autosave timer";
		await harness.view.prepare("concept-other");
		assert.equal(harness.view.frontEl.value, "Typed before the autosave timer");
		assert.equal(harness.saveCalls.at(-1)?.front, "Typed before the autosave timer");
		harness.view.concepts = [{ conceptId: "concept-other", title: "Other", path: "Other.md" }];
		harness.view.ensureSelectedConcept();
		assert.equal(harness.view.draft.conceptId, "concept-a", "a meaningful draft cannot silently change Concept");
	}

	console.log("Card Composer lifecycle tests passed.");
}

export const done = run();
