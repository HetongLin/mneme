import assert from "node:assert/strict";
import { CardIdRepairModal } from "../src/modals/cardIdRepairModal";
import { RecoverableCardIdRepair } from "../src/services/recoverableCardIdRepair";
import { createDefaultPluginData, ReviewStateStore } from "../src/services/reviewStateStore";
import { FsrsReviewScheduler } from "../src/services/fsrsReviewScheduler";
import type { MnemePluginData } from "../src/models/reviewState";
import type { LoadedMnemeCard } from "../src/models/card";
import { App, Notice } from "obsidian";

const content = '<!-- MNEME:FRONT:start -->\nQuestion\n<!-- MNEME:FRONT:end -->\n<!-- MNEME:BACK:start -->\nAnswer\n<!-- MNEME:BACK:end -->';
const card: LoadedMnemeCard = { content, path: "Cards.md", cardId: "Cards.md#0", id: "Cards.md#0", cardIndex: 0,
	hasExplicitCardId: false, front: "Question", back: "Answer", errors: [], warnings: [], isValid: true, basename: "Cards" };
const save = (modal: CardIdRepairModal, button: HTMLButtonElement) =>
	(modal as unknown as { save(id: string, button: HTMLButtonElement): Promise<void> }).save("card-new", button);
const button = () => ({ disabled: false } as HTMLButtonElement);

export const done = (async () => {
	// Real persistence succeeds, then the refresh throws: identity and migrated state must remain aligned.
	let data = createDefaultPluginData();
	let markdown = content, writes = 0;
	const storage = { loadData: async () => structuredClone(data), saveData: async (next: MnemePluginData) => { data = structuredClone(next); } };
	const store = new ReviewStateStore(storage, new FsrsReviewScheduler());
	await store.recordReview(card.cardId, "good");
	const service = new RecoverableCardIdRepair({ readFresh: async () => markdown,
		listMarkdownFiles: async () => [{ path: card.path }], parseFrontmatter: () => undefined,
		process: async (_path, transform) => { markdown = transform(markdown); writes++; } }, storage);
	Notice.messages = [];
	const modal = new CardIdRepairModal(new App(), { card, existingCardIds: new Set(),
		onConfirmed: (id) => service.repair(card, id), onSaved: () => { throw new Error("refresh failed"); } });
	await save(modal, button());
	assert.match(markdown, /id="card-new"/);
	assert.equal(writes, 1);
	assert.equal(data.reviewStates[card.cardId], undefined);
	assert.equal(data.reviewStates["card-new"]?.reviewCount, 1);
	assert.ok(Notice.messages.some((message) => message.includes("Card ID saved. Reopen")));
	assert.equal((modal as unknown as { closed: boolean }).closed, true);

	// A double click/close during persistence still submits once and refreshes only after completion.
	let release!: () => void;
	const barrier = new Promise<void>((resolve) => { release = resolve; });
	let confirmed = 0, refreshed = 0;
	const delayed = new CardIdRepairModal(new App(), { card, existingCardIds: new Set(),
		onConfirmed: async () => { confirmed++; await barrier; }, onSaved: () => { refreshed++; } });
	const control = button();
	const first = save(delayed, control);
	await save(delayed, control);
	delayed.close();
	assert.equal(confirmed, 1); assert.equal(refreshed, 0); assert.equal(control.disabled, true);
	release(); await first;
	assert.equal(refreshed, 1);

	Notice.messages = [];
	const failed = new CardIdRepairModal(new App(), { card, existingCardIds: new Set(),
		onConfirmed: () => { throw new Error("save failed after effect"); }, onSaved: () => { assert.fail("must not refresh as success"); } });
	await save(failed, button());
	assert.equal((failed as unknown as { closed: boolean }).closed, false);
	assert.ok(Notice.messages.some((message) => message.includes("Resume Card ID Repair")));
	console.log("Card ID repair modal tests passed.");
})();
