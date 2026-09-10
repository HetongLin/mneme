import assert from "node:assert/strict";
import type { ConceptSummary, ConceptMergeSuggestion } from "../src/models/conceptLibrary";
import type { ConceptMergeDraft } from "../src/services/conceptMergeDraft";
import type { ConceptMergeAiService, ConceptMergeAiDraft, ConceptMergeAiInspection } from "../src/services/conceptMergeAiService";
import type { ConceptMergeService, ConceptMergePlan, PrepareConceptMergeInput } from "../src/services/conceptMergeService";
import { createDefaultPluginData } from "../src/services/reviewStateStore";
import { MnemeConceptMergeView } from "../src/views/conceptMergeView";
import { nextModal, confirmModal } from "./helpers/obsidianConflictMergeStub";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
const concept = (id: string): ConceptSummary => ({ conceptId: id, path: `${id}.md`, title: id, coreMeaning: `Meaning ${id}` });
const a = concept("alpha"), b = concept("beta"), c = concept("gamma"), d = concept("delta");
const all = [a, b, c, d];
const ai = (title: string): ConceptMergeAiDraft => ({ title, coreMeaning: title, whyItMatters: title });
const button = () => ({ disabled: false } as HTMLButtonElement);
interface Harness {
	concepts: ConceptSummary[];
	firstConceptId?: string;
	secondConceptId?: string;
	survivorConceptId?: string;
	draft?: ConceptMergeDraft;
	operationRevision: number;
	isWorking: boolean;
	isClosed: boolean;
	completed: boolean;
	commitPromise?: Promise<void>;
	inspections: Map<string, ConceptMergeAiInspection>;
	scanner: { scanConcepts(): Promise<ConceptSummary[]> };
	actions: {
		mergeService: Pick<ConceptMergeService, "prepare" | "execute">;
		aiService: Pick<ConceptMergeAiService, "draftMerge" | "inspectCandidates">;
		readMarkdown(path: string): Promise<string>;
		onMerged(): Promise<void>;
		englishAliasesEnabled(): boolean;
	};
	contentEl: { empty(): void };
	app: object;
	render(): void;
	renderSuccess(survivor: ConceptSummary): void;
	refresh: MnemeConceptMergeView["refresh"];
	setSelection: MnemeConceptMergeView["setSelection"];
	startManualDraft(first: ConceptSummary, second: ConceptSummary): void;
	startAiDraft(first: ConceptSummary, second: ConceptSummary, button: HTMLButtonElement): Promise<void>;
	inspectWithAi(first: ConceptSummary, suggestions: ConceptMergeSuggestion[], button: HTMLButtonElement): Promise<void>;
	requestMergeConfirmation(button: HTMLButtonElement): Promise<void>;
	onClose(): Promise<void>;
}
function plan(input: PrepareConceptMergeInput): ConceptMergePlan {
	return {
		...input, cardsMoved: 0, cardsPreserved: 0, dataSnapshot: "", duplicateDismissalsMigrated: 0,
		nextData: createDefaultPluginData(), pauseMigrated: false, relatedConceptsRewired: 0,
		sourceLinkChanges: [], sourceLinksMigrated: 0, sourceLinksPreserved: 0,
		writes: [{ path: input.survivor.path, label: "Survivor", before: "before",
			after: `---\nmneme_type: concept\nmneme_id: ${input.survivor.conceptId}\n---\n# Original\n` }],
	};
}
function harness() {
	const view = Object.create(MnemeConceptMergeView.prototype) as Harness;
	const counts = { renders: 0, prepares: 0, callbacks: 0 };
	const executions: ConceptMergePlan[] = [];
	const successes: ConceptSummary[] = [];
	Object.assign(view, {
		concepts: all, operationRevision: 0, isWorking: false, isClosed: false, completed: false,
		inspections: new Map(), contentEl: { empty: () => undefined }, app: {},
		scanner: { scanConcepts: async () => all }, render: () => counts.renders++,
		renderSuccess: (survivor: ConceptSummary) => successes.push(survivor),
	});
	view.actions = {
		mergeService: {
			prepare: async (input) => { counts.prepares++; return { status: "ready", plan: plan(input) }; },
			execute: async (prepared) => { executions.push(prepared); return { status: "merged" }; },
		},
		aiService: { draftMerge: async () => ai("AI"), inspectCandidates: async () => [] },
		readMarkdown: async () => "# Original", onMerged: async () => { counts.callbacks++; },
		englishAliasesEnabled: () => true,
	};
	return { view, counts, executions, successes };
}
async function select(view: Harness, first = a, second = b) {
	await view.setSelection(first, second);
	view.startManualDraft(first, second);
}
async function confirmation(view: Harness) {
	const opened = nextModal();
	const request = view.requestMergeConfirmation(button());
	return { request, modal: await opened };
}
async function run(): Promise<void> {
	{
		const h = harness();
		await select(h.view);
		h.view.draft!.coreMeaning = "Unsaved learner text";
		const draft = structuredClone(h.view.draft);
		h.view.scanner.scanConcepts = async () => [];
		await h.view.refresh();
		assert.deepEqual(h.view.draft, draft, "a scan losing the selection must retain authored text");
		await h.view.requestMergeConfirmation(button());
		assert.deepEqual(h.executions, []);
	}
	for (const change of ["close", "pair", "same_pair", "refresh"] as const) {
		const h = harness();
		await select(h.view);
		const { request, modal } = await confirmation(h.view);
		if (change === "close") await h.view.onClose();
		else if (change === "refresh") await h.view.refresh();
		else await select(h.view, change === "pair" ? c : a, change === "pair" ? d : b);
		const renders = h.counts.renders;
		confirmModal(modal, true);
		await request;
		assert.deepEqual(h.executions, [], `${change}: an obsolete confirmation must not execute`);
		assert.equal(h.counts.callbacks, 0);
		assert.equal(h.counts.renders, renders);
	}
	{
		const h = harness();
		await select(h.view);
		const { request, modal } = await confirmation(h.view);
		assert.equal(h.view.isWorking, true);
		const draft = structuredClone(h.view.draft);
		h.view.startManualDraft(a, b);
		await h.view.requestMergeConfirmation(button());
		assert.equal(h.counts.prepares, 1);
		assert.deepEqual(h.view.draft, draft);
		confirmModal(modal, false);
		await request;
		assert.equal(h.view.isWorking, false);
	}
	for (const close of [false, true]) {
		const h = harness();
		await select(h.view);
		const started = deferred<void>(), response = deferred<ConceptMergeAiDraft>();
		h.view.actions.aiService.draftMerge = async () => { started.resolve(); return response.promise; };
		const oldRequest = h.view.startAiDraft(a, b, button());
		await started.promise;
		if (close) await h.view.onClose();
		else await select(h.view, c, d);
		const draft = structuredClone(h.view.draft);
		const renders = h.counts.renders;
		response.resolve(ai("Stale draft"));
		await oldRequest;
		assert.deepEqual(h.view.draft, draft);
		assert.equal(h.counts.renders, renders);
	}
	{
		const h = harness();
		await select(h.view);
		const started = deferred<void>(), response = deferred<ConceptMergeAiInspection[]>();
		h.view.actions.aiService.inspectCandidates = async () => { started.resolve(); return response.promise; };
		const oldRequest = h.view.inspectWithAi(a, [], button());
		await started.promise;
		await select(h.view, c, d);
		const newStarted = deferred<void>(), newResponse = deferred<ConceptMergeAiDraft>();
		h.view.actions.aiService.draftMerge = async () => { newStarted.resolve(); return newResponse.promise; };
		const newRequest = h.view.startAiDraft(c, d, button());
		await newStarted.promise;
		response.resolve([{ conceptId: b.conceptId, classification: "likely_duplicate", reason: "Old result" }]);
		await oldRequest;
		assert.equal(h.view.inspections.size, 0);
		assert.equal(h.view.isWorking, true, "old finally cannot release a new operation's lock");
		newResponse.resolve(ai("Current result"));
		await newRequest;
		assert.equal(h.view.draft?.title, "Current result");
	}
	for (const phase of ["read", "prepare", "scan"] as const) {
		const h = harness();
		await select(h.view);
		const started = deferred<void>(), release = deferred<void>();
		let aiCalls = 0;
		let request: Promise<void>;
		if (phase === "read") {
			h.view.actions.readMarkdown = async () => { started.resolve(); await release.promise; return "# Original"; };
			h.view.actions.aiService.draftMerge = async () => { aiCalls++; return ai("Late"); };
			request = h.view.startAiDraft(a, b, button());
		} else if (phase === "prepare") {
			h.view.actions.mergeService.prepare = async (input) => { started.resolve(); await release.promise; return { status: "ready", plan: plan(input) }; };
			request = h.view.requestMergeConfirmation(button());
		} else {
			h.view.scanner.scanConcepts = async () => { started.resolve(); await release.promise; return [c, d]; };
			request = h.view.refresh(c, d);
		}
		await started.promise;
		await h.view.onClose();
		const renders = h.counts.renders;
		const concepts = [...h.view.concepts];
		release.resolve();
		await request;
		assert.equal(h.counts.renders, renders);
		assert.equal(aiCalls, 0);
		assert.deepEqual(h.executions, []);
		assert.deepEqual(h.view.concepts, concepts);
	}
	{
		const h = harness();
		const started = deferred<void>(), release = deferred<void>();
		let calls = 0;
		h.view.scanner.scanConcepts = async () => {
			if (calls++ === 0) { started.resolve(); await release.promise; return [a, b]; }
			return [c, d];
		};
		const old = h.view.setSelection(a, b);
		await started.promise;
		await h.view.setSelection(c, d);
		release.resolve();
		await old;
		assert.deepEqual(h.view.concepts, [c, d]);
		assert.equal(h.view.firstConceptId, c.conceptId);
		assert.equal(h.view.secondConceptId, d.conceptId);
	}
	for (const change of ["close", "pair", "refresh"] as const) {
		const h = harness();
		await select(h.view);
		const started = deferred<void>(), release = deferred<void>();
		h.view.actions.mergeService.execute = async (prepared) => {
			h.executions.push(prepared); started.resolve(); await release.promise; return { status: "merged" };
		};
		const { request, modal } = await confirmation(h.view);
		confirmModal(modal, true);
		await started.promise;
		let finished = false;
		const transition = (change === "close" ? h.view.onClose() : change === "pair" ? h.view.setSelection(c, d) : h.view.refresh())
			.then(() => { finished = true; });
		await nextTurn();
		assert.equal(finished, false);
		assert.equal(h.view.firstConceptId, a.conceptId);
		release.resolve();
		await Promise.all([request, transition]);
		assert.equal(h.executions.length, 1);
		assert.equal(h.executions[0]?.survivor.conceptId, a.conceptId);
		assert.equal(h.counts.callbacks, 1);
		if (change === "close") assert.deepEqual(h.successes, []);
		else {
			assert.equal(h.view.completed, false);
			assert.equal(h.view.draft, undefined);
			if (change === "pair") assert.equal(h.view.firstConceptId, c.conceptId);
		}
	}
	{
		const h = harness();
		await select(h.view);
		const { request, modal } = await confirmation(h.view);
		confirmModal(modal, true);
		await request;
		await h.view.requestMergeConfirmation(button());
		assert.equal(h.executions.length, 1, "successful Merge cannot be resubmitted from old controls");
		assert.equal(h.view.completed, true);
		assert.equal(h.view.draft, undefined);
		assert.equal(h.successes[0]?.conceptId, a.conceptId);
	}
	console.log("Guided Merge lifecycle tests passed.");
}
export const done = run();
