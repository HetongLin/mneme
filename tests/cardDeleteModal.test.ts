import assert from "node:assert/strict";
import { CardDeleteModal } from "../src/modals/cardDeleteModal";
import { App, Notice } from "obsidian";

const card = {
	cardId: "card-1",
	path: "Cards.md",
	front: "front",
	back: "back",
} as never;

function button(): HTMLButtonElement {
	return { disabled: false } as HTMLButtonElement;
}

function invokeDelete(modal: CardDeleteModal, deleteButton: HTMLButtonElement): Promise<void> {
	return (modal as unknown as { delete(button: HTMLButtonElement): Promise<void> }).delete(deleteButton);
}

async function run(): Promise<void> {
	Notice.messages = [];
	{
		let confirmed = 0;
		let deleted = 0;
		const modal = new CardDeleteModal(new App(), {
			card,
			onConfirmed: async () => { confirmed += 1; },
			onDeleted: async () => { deleted += 1; },
		} as never);
		const deleteButton = button();
		await invokeDelete(modal, deleteButton);
		assert.equal(confirmed, 1);
		assert.equal(deleted, 1);
		assert.equal((modal as unknown as { closed: boolean }).closed, true);
		assert.equal(deleteButton.disabled, false);
		assert.ok(Notice.messages.some((message) => message.includes("Card deleted")));
	}

	Notice.messages = [];
	{
		let deleted = 0;
		const modal = new CardDeleteModal(new App(), {
			card,
			onConfirmed: async () => { throw new Error("delete failed"); },
			onDeleted: async () => { deleted += 1; },
		} as never);
		const deleteButton = button();
		await invokeDelete(modal, deleteButton);
		assert.equal(deleted, 0);
		assert.equal((modal as unknown as { closed: boolean }).closed, false);
		assert.equal(deleteButton.disabled, false);
		assert.ok(Notice.messages.some((message) => message.includes("could not be deleted")));
	}

	Notice.messages = [];
	{
		let release!: () => void;
		const barrier = new Promise<void>((resolve) => { release = resolve; });
		let confirmed = 0;
		let deleted = 0;
		const modal = new CardDeleteModal(new App(), {
			card,
			onConfirmed: async () => { confirmed += 1; await barrier; },
			onDeleted: async () => { deleted += 1; },
		} as never);
		const deleteButton = button();
		const first = invokeDelete(modal, deleteButton);
		const second = invokeDelete(modal, deleteButton);
		release();
		await Promise.all([first, second]);
		assert.equal(confirmed, 1);
		assert.equal(deleted, 1);
	}

	Notice.messages = [];
	{
		let confirmed = 0;
		let deleted = 0;
		const modal = new CardDeleteModal(new App(), {
			card,
			onConfirmed: async () => { confirmed += 1; },
			onDeleted: async () => { deleted += 1; throw new Error("refresh failed"); },
		} as never);
		await invokeDelete(modal, button());
		assert.equal(confirmed, 1);
		assert.equal(deleted, 1);
		assert.equal((modal as unknown as { closed: boolean }).closed, true);
		assert.ok(Notice.messages.some((message) => message.includes("Card deleted")));
		assert.ok(Notice.messages.some((message) => message.includes("refresh")));
	}

	console.log("Card delete modal tests passed.");
}

export const done = run();
