import assert from "node:assert/strict";
import { MnemeConceptComposerView } from "../src/views/conceptComposerView";
import { createEmptyManualConceptDraft, type ManualConceptDraft } from "../src/models/manualConceptDraft";
import type { ManualConceptCreationResult } from "../src/services/manualConceptWriteService";
import type { ManualConceptWriteReceipt } from "../src/models/manualConceptWrite";

(globalThis as any).window = { clearTimeout, setTimeout };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
	return { promise, resolve, reject };
}

function field(value = "") {
	return { value, disabled: false, textContent: "", focused: false, setText(text: string) { this.textContent = text; }, setAttribute(): void {}, addEventListener(): void {}, focus() { assert.equal(this.disabled, false, "focus requires an enabled field"); this.focused = true; }, select(): void {}, scrollIntoView(): void {} };
}

function harness(overrides: {
	create?: (draft: ManualConceptDraft) => Promise<ManualConceptCreationResult>;
	getState?: () => Promise<{ draft: ManualConceptDraft; pendingWrite?: ManualConceptWriteReceipt }>;
	suggest?: () => Promise<{ englishName: string }>;
	onCreated?: () => Promise<void>;
	saveDraft?: () => Promise<void>;
	listSourcePaths?: () => string[];
	scanConcepts?: () => Promise<unknown[]>;
} = {}) {
	const draft = { ...createEmptyManualConceptDraft(undefined, "2026-09-07T00:00:00.000Z", "draft-a"), title: "概念", coreMeaning: "Meaning" };
	const concept = { conceptId: "concept-a", path: "Concept.md", title: "Concept" };
	const fields = [field(draft.title), field(draft.coreMeaning), field(), field(), field("reviewable"), field("normal"), field()];
	const openButton = field(); openButton.textContent = "Open Concept Markdown";
	const tagButton = field(); tagButton.textContent = "Add tag";
	const sourceButton = field();
	const aliasButton = field(); aliasButton.textContent = "Generate with AI";
	const createButton = field();
	const controls = [...fields, openButton, tagButton, sourceButton, aliasButton, createButton];
	const view = Object.create(MnemeConceptComposerView.prototype) as any;
	const createCalls: ManualConceptDraft[] = [];
	const clearCalls: string[] = [];
	const saveCalls: ManualConceptDraft[] = [];
	let renderCalls = 0;
	Object.assign(view, {
		draft, app: { workspace: { revealLeaf: async () => {} } }, concepts: [concept], isReady: true, isSaving: false, lifecycleToken: 0, hasRendered: true,
		pendingWrite: undefined, loadError: undefined, saveQueue: Promise.resolve(), saveTimer: undefined,
		englishNameRequest: 0, acknowledgedDuplicateSignature: undefined,
		titleEl: fields[0], coreMeaningEl: fields[1], whyItMattersEl: fields[2], sourcePathEl: fields[3],
		learningModeEl: fields[4], importanceEl: fields[5], englishNameEl: fields[6],
		englishNameButtonEl: aliasButton, englishNameFieldEl: { toggleClass(): void {} },
		englishNameAssistEl: { setText(): void {} }, createButtonEl: createButton,
		createdResultEl: { empty(): void {} }, statusEl: { setText(): void {}, empty(): void {} }, duplicateEl: { empty(): void {} },
		tagPicker: { getTags: () => [], refresh(): void {}, setCatalog(): void {}, setTags(): void {} }, tagCatalog: [],
		markdownComponent: { load(): void {}, unload(): void {} }, contentEl: {
			querySelectorAll: () => controls,
			empty(): void {}, addClass(): void {}, scrollTo(): void {},
		},
		options: {
			create: async (nextDraft: ManualConceptDraft) => { createCalls.push(nextDraft); return overrides.create ? overrides.create(nextDraft) : { conceptId: "concept-a", path: "Concept.md", nextDraft: createEmptyManualConceptDraft(undefined, undefined, "draft-next") }; },
			draftStore: {
			getState: async () => overrides.getState ? overrides.getState() : { draft: { ...draft } },
				saveDraft: async (value: ManualConceptDraft) => { saveCalls.push(value); await overrides.saveDraft?.(); }, clearDraft: async (id: string) => { clearCalls.push(id); },
		},
			canSuggestEnglishName: () => true, englishAliasesEnabled: () => true,
			findNameConflict: async () => undefined, getCurrentSourcePath: () => undefined, listSourcePaths: overrides.listSourcePaths ?? (() => []),
			onCreated: async () => { await overrides.onCreated?.(); }, openMerge: async () => {}, openConceptMarkdown: async () => {},
			scanConcepts: overrides.scanConcepts ?? (async () => []), suggestEnglishName: overrides.suggest ?? (async () => ({ englishName: "Alias" })), discardMergeDraft: async () => {},
			viewConcept: async () => {},
		},
		showCreatedResult: () => {}, renderDuplicates: () => {},
		render: () => { renderCalls += 1; fields[0].value = view.draft.title; fields[1].value = view.draft.coreMeaning; fields[2].value = view.draft.whyItMatters; fields[3].value = view.draft.sourcePath ?? ""; fields[4].value = view.draft.learningMode; fields[5].value = view.draft.importance; fields[6].value = view.draft.englishName; view.updateControls(); }, refreshTagCatalog: async () => {},
	});
	return { view, draft, concept, fields, controls, openButton, createCalls, clearCalls, saveCalls, get renderCalls() { return renderCalls; } };
}

const receipt: ManualConceptWriteReceipt = {
	version: 1, draftId: "draft-a", inputHash: "a".repeat(64), conceptId: "concept-a",
	path: "Concept.md", cardsPath: "Cards.md", afterHash: "b".repeat(64), englishAliasesEnabled: true,
	createdAt: "2026-09-07T00:00:00.000Z", status: "pending",
};
const result = (): ManualConceptCreationResult => ({
	conceptId: "concept-a", path: "Concept.md", nextDraft: createEmptyManualConceptDraft(undefined, undefined, "draft-next"),
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function run(): Promise<void> {
	{
		const h = harness({ getState: async () => ({ draft: h.draft, pendingWrite: receipt }), create: async () => { throw new Error("resume failed"); } });
		h.draft.sourcePath = "Moved.md";
		h.draft.englishName = "Saved Alias";
		h.view.pendingWrite = receipt;
		h.view.options.englishAliasesEnabled = () => false;
		for (const method of ["listSourcePaths", "findNameConflict", "scanConcepts"]) {
			h.view.options[method] = () => { throw new Error("Pending recovery must skip preflight"); };
		}
		await h.view.createConcept();
		assert.equal(h.createCalls.length, 1);
		assert.equal(h.createCalls[0]?.englishName, "Saved Alias");
		assert.equal(h.saveCalls.length, 0);
		assert.equal(h.clearCalls.length, 0);
		for (const control of h.controls) {
			assert.equal(control.disabled, control !== h.openButton && control !== h.view.createButtonEl);
		}
		assert.equal(h.view.createButtonEl.textContent, "Resume Creation");
	}
	{
		const h = harness({ create: async () => { throw new Error("write failed"); }, getState: async () => { throw new Error("reload failed"); } });
		await h.view.createConcept();
		assert.ok(h.view.loadError);
		assert.ok(h.controls.every((control) => control.disabled));
		const saves = h.saveCalls.length;
		await h.view.onClose();
		assert.equal(h.saveCalls.length, saves, "failed recovery state must not save a fallback draft on close");
	}
	{
		const h = harness({ saveDraft: async () => { throw new Error("draft save failed"); } });
		h.view.titleEl.value = "Newest local title";
		await h.view.createConcept();
		assert.equal(h.createCalls.length, 0);
		assert.equal(h.view.draft.title, "Newest local title");
		assert.equal(h.view.titleEl.value, "Newest local title");
		assert.equal(h.view.draft.draftId, "draft-a");
		assert.equal(h.fields[0].disabled, false);
	}
	{
		let created = 0;
		const h = harness({ onCreated: async () => { created += 1; } });
		await h.view.createConcept();
		assert.equal(h.createCalls[0]?.draftId, "draft-a");
		assert.equal(h.view.draft.draftId, "draft-next");
		assert.equal(h.view.titleEl.value, "");
		assert.equal(h.clearCalls.length, 0);
		assert.equal(h.saveCalls.length, 1, "only the fresh preflight saves the draft");
		assert.equal(created, 1);
	}
	{
		const pending = deferred<ManualConceptCreationResult>();
		const entered = deferred<void>();
		let created = 0;
		const h = harness({ create: () => { entered.resolve(); return pending.promise; }, onCreated: async () => { created += 1; } });
		const creating = h.view.createConcept();
		await entered.promise;
		assert.ok(h.controls.every((control) => control.disabled));
		let closed = false;
		const closing = h.view.onClose().then(() => { closed = true; });
		await tick();
		assert.equal(closed, false, "close waits for the in-flight coordinator");
		pending.resolve(result());
		await Promise.all([creating, closing]);
		assert.equal(h.renderCalls, 0);
		assert.equal(created, 1, "global refresh still runs after closing");
		assert.equal(h.view.draft.draftId, "draft-next");
		assert.equal(h.saveCalls.length, 1);
	}
	{
		const entered = deferred<void>();
		const lookup = deferred<undefined>();
		const h = harness();
		h.view.options.findNameConflict = () => { entered.resolve(); return lookup.promise; };
		const creating = h.view.createConcept();
		await entered.promise;
		const closing = h.view.onClose();
		lookup.resolve(undefined);
		await Promise.all([creating, closing]);
		assert.equal(h.createCalls.length, 0, "late preflight cannot create after close");
		assert.equal(h.renderCalls, 0);
	}
	{
		const state = deferred<{ draft: ManualConceptDraft }>();
		const h = harness({ getState: () => state.promise });
		h.view.isReady = false;
		const opening = h.view.onOpen();
		await h.view.onClose();
		state.resolve({ draft: h.draft });
		await opening;
		assert.equal(h.renderCalls, 0);
		assert.equal(h.view.isReady, false);
		assert.equal(h.saveCalls.length, 0);
	}
	{
		const h = harness({ getState: async () => { throw new Error("load failed"); } });
		await h.view.onOpen();
		assert.ok(h.view.loadError);
		assert.ok(h.controls.every((control) => control.disabled));
		await h.view.onClose();
		assert.equal(h.saveCalls.length, 0);
		assert.equal(h.clearCalls.length, 0);
	}
	for (const action of ["title", "create", "close"] as const) {
		const suggestion = deferred<{ englishName: string }>();
		const h = harness({ suggest: () => suggestion.promise });
		const request = h.view.generateEnglishName();
		if (action === "title") {
			h.view.titleEl.value = "新标题";
			h.view.onTitleChanged();
		} else if (action === "create") {
			await h.view.createConcept();
		} else await h.view.onClose();
		const saves = h.saveCalls.length;
		suggestion.resolve({ englishName: "Stale Alias" });
		await request;
		assert.equal(h.view.englishNameEl.value, "", `late alias ignored after ${action}`);
		assert.equal(h.saveCalls.length, saves);
		if (action !== "close") await h.view.onClose();
	}
	{
		const state = deferred<{ draft: ManualConceptDraft }>();
		const h = harness({ getState: () => state.promise });
		const waiting = h.view.completeConflictMerge("draft-a");
		h.view.draft = { ...h.draft, draftId: "draft-new" };
		state.resolve({ draft: { ...h.draft, draftId: "draft-old" } });
		await waiting;
		assert.equal(h.view.draft.draftId, "draft-new");
		assert.equal(h.renderCalls, 0);
	}
	{
		const h = harness();
		h.view.app.workspace.revealLeaf = () => { throw new Error("stale callback should be ignored"); };
		await h.view.returnToConflictOptions({ existing: h.concept }, "retired-draft");
		assert.equal(h.createCalls.length, 0);
	}
	{
		const h = harness();
		await h.view.createConcept({ conflict: { existing: h.concept }, resolution: "refine_name" });
		assert.equal(h.fields[0].focused, true, "refinement focuses after unlocking");
		assert.equal(h.fields[0].disabled, false);
		assert.equal(h.createCalls.length, 0);
	}
	{
		const h = harness();
		h.view.titleEl.value = "Entropy Reduction";
		h.view.coreMeaningEl.value = "Information gain measures the reduction in entropy after a split.";
		h.view.options.scanConcepts = async () => [{ ...h.concept, title: "Information Gain", coreMeaning: h.view.coreMeaningEl.value }];
		await h.view.createConcept();
		assert.equal(h.view.createButtonEl.textContent, "Create Anyway");
		assert.equal(h.createCalls.length, 0);
		await h.view.createConcept();
		assert.equal(h.createCalls.length, 1);
		assert.equal(h.view.createButtonEl.textContent, "Create Concept");
	}
	for (const close of [false, true]) {
		const scan = deferred<unknown[]>();
		const h = harness({ scanConcepts: () => scan.promise });
		delete h.view.refreshTagCatalog;
		let catalogUpdates = 0;
		h.view.tagPicker.setCatalog = () => { catalogUpdates += 1; };
		const refreshing = h.view.refreshTagCatalog();
		if (close) await h.view.onClose();
		else h.view.isSaving = true;
		scan.resolve([]);
		await refreshing;
		assert.equal(catalogUpdates, close ? 0 : 1);
		if (!close) assert.ok(h.controls.every((control) => control.disabled), "late catalog refresh keeps creation controls locked");
	}
	console.log("Concept Composer lifecycle tests passed.");
}

export const done = run();
