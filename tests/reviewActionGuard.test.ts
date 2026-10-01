import assert from "node:assert/strict";
import { MnemeReviewView } from "../src/views/reviewView";
import { ReviewActionGuard } from "../src/services/reviewActionGuard";

type PendingWrite = ReturnType<typeof deferred>;
type ActionMethod = "rateCurrentCard" | "deferCurrentCard" | "suspendCurrentCard" | "retireCurrentCard";

interface ReviewHarness {
	actionGuard: ReviewActionGuard;
	selectedCardIndex: number;
	selectedCards: Array<{ cardId: string }>;
	selectedConcept: unknown;
	skippedCardCount: number;
	statusMessage: string;
	isAnswerShown: boolean;
	refreshPresentation(): void;
	rateCurrentCard(rating: "good"): Promise<void>;
	deferCurrentCard(): Promise<void>;
	suspendCurrentCard(): Promise<void>;
	retireCurrentCard(): Promise<void>;
	skipCurrentCard(): void;
	resetReviewState(): void;
	onClose(): Promise<void>;
}

function deferred() {
	let resolve!: (value: object) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<object>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

// Use the real View action methods. Only Obsidian rendering and persistence are
// replaced, so the test observes actual queue advancement and button recovery.
function createHarness(write: PendingWrite) {
	const calls: string[] = [];
	const started = deferred();
	let buttons = [{ disabled: false }, { disabled: false }];
	const view = Object.create(MnemeReviewView.prototype) as ReviewHarness;
	const persist = (cardId: string) => {
		calls.push(cardId);
		started.resolve({});
		return write.promise;
	};
	const cards = ["card-a", "card-b", "card-c"].map((cardId) => ({
		cardId,
		card: { cardId, hasExplicitCardId: true, isValid: true, path: "Cards.md", front: "Front", back: "Back" },
	}));
	const concept = { conceptId: "owner", title: "Concept", concept: {
		id: "owner", retentionTarget: 0.9, errors: [], cards: cards.map((card) => card.card),
	} };
	Object.assign(view, {
		actionGuard: new ReviewActionGuard(),
		activeDeferrals: {}, activeRetirements: {}, activeSuspensions: {},
		deferredCardCount: 0, suspendedCardCount: 0, skippedCardCount: 0,
		isReviewComplete: false, selectedCardIndex: 0,
		selectedCards: cards, selectedConcept: concept,
		loader: { loadConcepts: async () => ({ concepts: [concept.concept] }) },
		contentEl: {
			querySelectorAll: () => buttons,
			empty: () => { buttons = []; },
		},
		reviewStateStore: {
			recordReview: async (cardId: string, _rating: "good", options?: { validateBeforeRecord?: () => Promise<void> }) => {
				if (options?.validateBeforeRecord) await options.validateBeforeRecord();
				return persist(cardId);
			},
			deferReviewUntil: persist,
			suspendCard: persist, retireCard: persist,
		},
		render: () => {
			buttons = [{ disabled: view.actionGuard.isBusy }, { disabled: view.actionGuard.isBusy }];
		},
	});
	return { view, calls, concept, started: started.promise, buttons: () => buttons };
}

async function run(): Promise<void> {
	for (const method of ["rateCurrentCard", "deferCurrentCard", "suspendCurrentCard", "retireCurrentCard"] as const) {
		const write = deferred();
		const { view, calls, buttons, started } = createHarness(write);
		const pending = invoke(view, method);
		const duplicate = invoke(view, method);
		const competing = view.suspendCurrentCard();
		await started;
		assert.deepEqual(calls, ["card-a"], `${method}: persist exactly once`);
		assert.ok(buttons().every((button) => button.disabled), `${method}: disable immediately`);
		view.skipCurrentCard();
		assert.equal(view.selectedCardIndex, 0);
		assert.equal(view.skippedCardCount, 0);
		write.resolve({});
		await Promise.all([pending, duplicate, competing]);
		assert.equal(view.selectedCards[view.selectedCardIndex]?.cardId, "card-b");
		assert.equal(view.actionGuard.isBusy, false);
		assert.ok(buttons().every((button) => !button.disabled), `${method}: buttons recover`);
	}

	{
		const write = deferred();
		const { view, calls, buttons, started } = createHarness(write);
		const pending = view.rateCurrentCard("good");
		await started;
		write.reject(new Error("Disk unavailable"));
		await pending;
		assert.equal(view.selectedCardIndex, 0);
		assert.ok(buttons().every((button) => !button.disabled));
		assert.match(view.statusMessage, /Could not record review/);
		await view.rateCurrentCard("good");
		assert.deepEqual(calls, ["card-a", "card-a"], "failed write allows explicit retry");
	}

	{
		const write = deferred();
		const { view, calls, concept, buttons, started } = createHarness(write);
		const pending = view.rateCurrentCard("good");
		await started;
		view.resetReviewState();
		view.selectedCards = [{ cardId: "card-new-session" }];
		view.selectedConcept = concept;
		await view.rateCurrentCard("good");
		assert.deepEqual(calls, ["card-a"], "old persistence still owns the lock");
		write.resolve({});
		await pending;
		assert.equal(view.selectedCardIndex, 0);
		assert.equal(view.selectedCards[0]?.cardId, "card-new-session");
		assert.ok(buttons().every((button) => !button.disabled));
	}

	{
		const write = deferred();
		const { view, calls, concept } = createHarness(write);
		view.isAnswerShown = true;
		view.selectedCardIndex = 1;
		view.selectedConcept = concept;
		view.refreshPresentation();
		assert.equal(view.selectedCardIndex, 1, "presentation refresh preserves card position");
		assert.equal(view.isAnswerShown, true, "presentation refresh preserves answer state");
		assert.equal(view.selectedConcept, concept, "presentation refresh preserves selected concept");
		assert.deepEqual(calls, [], "presentation refresh does not persist FSRS state");
	}

	{
		const write = deferred();
		const { view, buttons, started } = createHarness(write);
		const pending = view.rateCurrentCard("good");
		await started;
		await view.onClose();
		write.resolve({});
		await pending;
		assert.equal(view.selectedCardIndex, 0, "closed View must not advance or render");
		assert.deepEqual(buttons(), []);
	}
	{
		const { view, calls, buttons } = createHarness(deferred());
		Object.assign(view, { loader: { loadConcepts: async () => { throw new Error("Scan unavailable"); } } });
		await view.rateCurrentCard("good");
		assert.deepEqual(calls, [], "a failed scan must not fall back to the stale session");
		assert.equal(view.selectedCardIndex, 0);
		assert.match(view.statusMessage, /Scan unavailable/);
		assert.equal(view.actionGuard.isBusy, false);
		assert.ok(buttons().every((button) => !button.disabled));
	}
	for (const cancel of ["reset", "close", "replace-selection"] as const) {
		const scan = deferred();
		const { view, calls, concept, buttons } = createHarness(deferred());
		Object.assign(view, { loader: { loadConcepts: () => scan.promise } });
		const pending = view.rateCurrentCard("good");
		await view.rateCurrentCard("good");
		view.skipCurrentCard();
		assert.equal(view.selectedCardIndex, 0, "scan holds the action lock");
		assert.deepEqual(calls, []);
		if (cancel === "close") await view.onClose();
		else if (cancel === "reset") view.resetReviewState();
		else view.selectedCards = [{ cardId: "replacement" }];
		scan.resolve({ concepts: [concept.concept] });
		await pending;
		assert.deepEqual(calls, [], `${cancel}: stale scan must not start persistence`);
		assert.equal(view.actionGuard.isBusy, false);
		assert.ok(buttons().every((button) => !button.disabled));
	}
	console.log("Review View asynchronous action tests passed.");
}

function invoke(view: ReviewHarness, method: ActionMethod): Promise<void> {
	return method === "rateCurrentCard" ? view.rateCurrentCard("good") : view[method]();
}

export const done = run();
