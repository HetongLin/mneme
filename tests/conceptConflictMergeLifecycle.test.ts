import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import type { ConceptConflictMergeDraftRecord } from "../src/models/conceptConflictMergeDraft";
import type { ConceptMergeDraft } from "../src/services/conceptMergeDraft";
import type { IncomingConceptMergeService, IncomingConceptMergePlan } from "../src/services/incomingConceptMergeService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { ConceptConflictMergeDraftStore } from "../src/services/conceptConflictMergeDraftStore";
import { MnemeConceptConflictMergeView, type ConceptConflictMergeSession } from "../src/views/conceptConflictMergeView";
import { nextModal, confirmModal } from "./helpers/obsidianConflictMergeStub";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
class Storage {
	data = createDefaultPluginData();
	saves = 0;
	async loadData(): Promise<unknown> { return structuredClone(this.data); }
	async saveData(data: MnemePluginData): Promise<void> { this.saves++; this.data = structuredClone(data); }
}
function makeSession(key = "merge", title = key): ConceptConflictMergeSession {
	return {
		key, incomingFingerprint: title, incomingMarkdown: `# ${title}`,
		existing: { conceptId: `existing-${title}`, path: `${title}.md`, title, coreMeaning: `Existing ${title}` },
		incoming: { conceptId: `incoming-${title}`, path: "", title: `Incoming ${title}`, coreMeaning: `Incoming ${title}` },
		origin: { kind: "inbox", proposalId: key, proposalUpdatedAt: "2026-09-10T00:00:00.000Z" },
		onReturn: () => undefined,
	};
}
function saved(session: ConceptConflictMergeSession, title: string): ConceptConflictMergeDraftRecord {
	return {
		key: session.key, existingConceptId: session.existing.conceptId,
		incomingFingerprint: session.incomingFingerprint, updatedAt: "2026-09-10T00:00:00.000Z",
		draft: { title, englishName: "", coreMeaning: `Handwritten ${title}`, whyItMatters: "Keep this",
			tags: ["kept"], importance: "normal", learningMode: "reviewable" },
	};
}
interface Harness {
	actions: {
		draftStore: Pick<ConceptConflictMergeDraftStore, "getDraft" | "saveDraft" | "clearDraft">;
		mergeService: Pick<IncomingConceptMergeService, "prepare" | "execute">;
		aiService: { draftMerge(input: unknown): Promise<Partial<ConceptMergeDraft>> };
		readMarkdown(path: string): Promise<string>;
		onMerged(session: ConceptConflictMergeSession): Promise<void>;
		englishAliasesEnabled(): boolean;
		shouldReturnOnClose(): boolean;
	};
	session?: ConceptConflictMergeSession;
	draft?: ConceptMergeDraft;
	sessionRevision: number;
	isClosed: boolean;
	isWorking: boolean;
	completed: boolean;
	returnHandled: boolean;
	saveQueue: Promise<void>;
	commitPromise?: Promise<void>;
	contentEl: ReturnType<typeof element>;
	app: object;
	leaf: { detach(): void };
	render(): void;
	setSession: MnemeConceptConflictMergeView["setSession"];
	requestMergeConfirmation(button: HTMLButtonElement): Promise<void>;
	draftWithAi(button: HTMLButtonElement): Promise<void>;
	onClose(): Promise<void>;
}
function element(onCreate: () => void) {
	return {
		empty(): void {}, addClass(..._classes: string[]): void {},
		createDiv(_options?: unknown) { onCreate(); return element(onCreate); },
		createEl(_tag: string, _options?: unknown) { onCreate(); return element(onCreate); },
	};
}
function harness() {
	const storage = new Storage();
	const store = new ConceptConflictMergeDraftStore(storage);
	const counts = { renders: 0, domCreates: 0, prepares: 0, executes: 0 };
	const mergedSessions: ConceptConflictMergeSession[] = [];
	const view = Object.create(MnemeConceptConflictMergeView.prototype) as Harness;
	view.actions = {
		draftStore: store,
		mergeService: {
			prepare: async (input) => {
				counts.prepares++;
				return { status: "ready", plan: { before: "before", after: "after", existing: input.existing,
					dataSnapshot: "", nextData: storage.data, sourceLinksAdded: 0, viewsAdded: 0 } };
			},
			execute: async () => { counts.executes++; return { status: "merged" }; },
		},
		aiService: { draftMerge: async () => ({ title: "AI result" }) },
		readMarkdown: async () => "# Existing",
		onMerged: async (session) => { mergedSessions.push(session); },
		englishAliasesEnabled: () => false, shouldReturnOnClose: () => false,
	};
	Object.assign(view, {
		sessionRevision: 0, isClosed: false, isWorking: false, completed: false, returnHandled: false,
		saveQueue: Promise.resolve(), contentEl: element(() => counts.domCreates++), app: {},
		leaf: { detach: () => undefined }, render: () => counts.renders++,
	});
	return { view, storage, store, counts, mergedSessions };
}
const button = () => ({ disabled: false } as HTMLButtonElement);
async function openConfirmation(view: Harness) {
	const opened = nextModal();
	const request = view.requestMergeConfirmation(button());
	return { request, modal: await opened };
}
async function run(): Promise<void> {
	// Even the same key can be reopened with a different incoming revision/target.
	for (const reuse of ["different_key", "same_key", "same_object"] as const) {
		const h = harness();
		const first = makeSession("first");
		await h.view.setSession(first);
		const { request, modal } = await openConfirmation(h.view);
		const second = reuse === "same_object" ? first : makeSession(reuse === "same_key" ? "first" : "second", "second");
		await h.view.setSession(second);
		const dataBefore = structuredClone(h.storage.data);
		confirmModal(modal, true);
		await request;
		assert.equal(h.counts.executes, 0, "a confirmation from the previous session must not write");
		assert.deepEqual(h.mergedSessions, []);
		assert.equal(h.view.session, second);
		assert.deepEqual(h.storage.data, dataBefore);
	}
	{
		const h = harness();
		const first = makeSession("unsaved");
		await h.view.setSession(first);
		h.view.draft!.title = "Unsaved learner edit";
		const before = structuredClone(h.view.draft);
		h.view.actions.draftStore = {
			getDraft: (key) => h.store.getDraft(key), clearDraft: (key) => h.store.clearDraft(key),
			saveDraft: async () => { throw new Error("Injected draft-save failure"); },
		};
		await h.view.setSession(makeSession("replacement"));
		assert.equal(h.view.session, first, "a failed flush must not switch away from unsaved edits");
		assert.deepEqual(h.view.draft, before);
		assert.equal(h.view.isWorking, false);
		assert.equal(await h.store.getDraft("replacement"), undefined);
	}
	{
		const h = harness();
		await h.view.setSession(makeSession());
		const { request, modal } = await openConfirmation(h.view);
		assert.equal(h.view.isWorking, true, "confirmation keeps the operation locked");
		await h.view.requestMergeConfirmation(button());
		assert.equal(h.counts.prepares, 1);
		confirmModal(modal, false);
		await request;
		assert.equal(h.view.isWorking, false);
		assert.equal(h.counts.executes, 0);
	}
	{
		const h = harness();
		await h.view.setSession(makeSession("old"));
		const oldResponse = deferred<Partial<ConceptMergeDraft>>();
		const oldStarted = deferred<void>();
		h.view.actions.aiService.draftMerge = async () => { oldStarted.resolve(); return oldResponse.promise; };
		const oldRequest = h.view.draftWithAi(button());
		await oldStarted.promise;
		await h.view.setSession(makeSession("new"));
		const newResponse = deferred<Partial<ConceptMergeDraft>>();
		const newStarted = deferred<void>();
		h.view.actions.aiService.draftMerge = async () => { newStarted.resolve(); return newResponse.promise; };
		const newRequest = h.view.draftWithAi(button());
		await newStarted.promise;
		const dataBefore = structuredClone(h.storage.data);
		const draftBefore = structuredClone(h.view.draft);
		oldResponse.resolve({ title: "Obsolete AI" });
		await oldRequest;
		assert.deepEqual(h.view.draft, draftBefore);
		assert.deepEqual(h.storage.data, dataBefore);
		assert.equal(h.view.isWorking, true, "old finally must not unlock the new request");
		newResponse.resolve({ title: "Current AI" });
		await newRequest;
		assert.equal(h.view.draft?.title, "Current AI");
		assert.equal((await h.store.getDraft("new"))?.draft.title, "Current AI");
	}
	for (const close of [false, true]) {
		const h = harness();
		const first = makeSession("same", "first");
		const second = makeSession("same", "second");
		await h.store.saveDraft(saved(first, "First saved"));
		const loaded = deferred<void>();
		const release = deferred<void>();
		let delay = true;
		h.view.actions.draftStore = {
			getDraft: async (key) => {
				const result = await h.store.getDraft(key);
				if (delay) { delay = false; loaded.resolve(); await release.promise; }
				return result;
			},
			saveDraft: (record) => h.store.saveDraft(record), clearDraft: (key) => h.store.clearDraft(key),
		};
		const firstLoad = h.view.setSession(first);
		await loaded.promise;
		if (close) await h.view.onClose();
		else {
			await h.store.saveDraft(saved(second, "Second saved"));
			await h.view.setSession(second);
		}
		const dataBefore = structuredClone(h.storage.data);
		const renders = h.counts.renders;
		release.resolve();
		await firstLoad;
		assert.deepEqual(h.storage.data, dataBefore);
		assert.equal(h.counts.renders, renders);
		if (!close) {
			assert.equal(h.view.session, second);
			assert.equal(h.view.draft?.title, "Second saved");
		} else assert.equal(h.view.draft, undefined);
	}
	for (const phase of ["read", "response", "prepare", "confirm"] as const) {
		const h = harness();
		await h.view.setSession(makeSession());
		const started = deferred<void>();
		const release = deferred<void>();
		let aiCalls = 0;
		let request: Promise<void>;
		let modal: Awaited<ReturnType<typeof nextModal>> | undefined;
		if (phase === "read" || phase === "response") {
			h.view.actions.readMarkdown = async () => {
				if (phase === "read") { started.resolve(); await release.promise; }
				return "# Existing";
			};
			h.view.actions.aiService.draftMerge = async () => {
				aiCalls++;
				started.resolve(); await release.promise;
				return { title: "Late AI" };
			};
			request = h.view.draftWithAi(button());
			await started.promise;
		} else if (phase === "prepare") {
			const prepare = h.view.actions.mergeService.prepare;
			h.view.actions.mergeService.prepare = async (input) => {
				started.resolve(); await release.promise; return prepare(input);
			};
			request = h.view.requestMergeConfirmation(button());
			await started.promise;
		} else ({ request, modal } = await openConfirmation(h.view));
		await h.view.onClose();
		const dataBefore = structuredClone(h.storage.data);
		const renders = h.counts.renders;
		release.resolve();
		if (modal) confirmModal(modal, true);
		await request;
		assert.deepEqual(h.storage.data, dataBefore, `${phase}: closed view must not persist late results`);
		assert.equal(h.counts.renders, renders);
		assert.equal(h.counts.executes, 0);
		if (phase === "read") assert.equal(aiCalls, 0, "closing during read prevents a later AI request");
	}
	for (const close of [false, true]) {
		const h = harness();
		const first = makeSession("commit-first");
		const second = makeSession("commit-second");
		await h.view.setSession(first);
		const started = deferred<void>();
		const release = deferred<void>();
		h.view.actions.mergeService.execute = async (_plan: IncomingConceptMergePlan) => {
			h.counts.executes++; started.resolve(); await release.promise;
			await h.store.clearDraft(first.key);
			return { status: "merged" };
		};
		const { request, modal } = await openConfirmation(h.view);
		confirmModal(modal, true);
		await started.promise;
		let finished = false;
		const transition = (close ? h.view.onClose() : h.view.setSession(second)).then(() => { finished = true; });
		await nextTurn();
		assert.equal(finished, false, "transition must wait for the already started commit");
		assert.equal(h.view.session, first);
		release.resolve();
		await Promise.all([request, transition]);
		assert.deepEqual(h.mergedSessions, [first]);
		assert.equal(await h.store.getDraft(first.key), undefined, "completed draft must not be saved again");
		assert.equal(h.counts.executes, 1);
		if (close) assert.equal(h.counts.domCreates, 0, "completion cannot redraw a closed view");
		else {
			assert.equal(h.view.session, second);
			assert.equal(h.view.completed, false);
		}
	}
	console.log("Concept conflict Merge lifecycle tests passed.");
}
export const done = run();
