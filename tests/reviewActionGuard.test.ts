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
	let buttons = [{ disabled: false }, { disabled: false }];
	const view = Object.create(MnemeReviewView.prototype) as ReviewHarness;
	const persist = (cardId: string) => {
		calls.push(cardId);
		return write.promise;
	};
	const concept = { title: "Concept", concept: { retentionTarget: 0.9 } };
	const cards = ["card-a", "card-b", "card-c"].map((cardId) => ({
		cardId,
		card: { hasExplicitCardId: true, path: "Cards.md" },
	}));
	Object.assign(view, {
		actionGuard: new ReviewActionGuard(),
		activeDeferrals: {}, activeRetirements: {}, activeSuspensions: {},
		deferredCardCount: 0, suspendedCardCount: 0, skippedCardCount: 0,
		isReviewComplete: false, selectedCardIndex: 0,
		selectedCards: cards, selectedConcept: concept,
		contentEl: {
			querySelectorAll: () => buttons,
			empty: () => { buttons = []; },
		},
		reviewStateStore: {
			recordReview: persist, deferReviewUntil: persist,
			suspendCard: persist, retireCard: persist,
		},
		render: () => {
			buttons = [{ disabled: view.actionGuard.isBusy }, { disabled: view.actionGuard.isBusy }];
		},
	});
	return { view, calls, concept, buttons: () => buttons };
}

async function run(): Promise<void> {
	for (const method of ["rateCurrentCard", "deferCurrentCard", "suspendCurrentCard", "retireCurrentCard"] as const) {
		const write = deferred();
		const { view, calls, buttons } = createHarness(write);
		const pending = invoke(view, method);
		const duplicate = invoke(view, method);
		const competing = view.suspendCurrentCard();
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
		const { view, calls, buttons } = createHarness(write);
		const pending = view.rateCurrentCard("good");
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
		const { view, calls, concept, buttons } = createHarness(write);
		const pending = view.rateCurrentCard("good");
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
		const { view, buttons } = createHarness(write);
		const pending = view.rateCurrentCard("good");
		await view.onClose();
		write.resolve({});
		await pending;
		assert.equal(view.selectedCardIndex, 0, "closed View must not advance or render");
		assert.deepEqual(buttons(), []);
	}
	console.log("Review View asynchronous action tests passed.");
}

function invoke(view: ReviewHarness, method: ActionMethod): Promise<void> {
	return method === "rateCurrentCard" ? view.rateCurrentCard("good") : view[method]();
}

void run();
