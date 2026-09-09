export { Component, App, WorkspaceLeaf, ItemView, Notice, MarkdownRenderer } from "./obsidianConceptComposerStub";

const opened: Modal[] = [];
const waiters: Array<(modal: Modal) => void> = [];
export class Modal {
	contentEl = { empty(): void {} };
	constructor(_app?: unknown) {}
	open(): void {
		const waiter = waiters.shift();
		if (waiter) waiter(this);
		else opened.push(this);
	}
	close(): void { this.onClose?.(); }
	onClose?(): void;
}
export function nextModal(): Promise<Modal> {
	const modal = opened.shift();
	return modal ? Promise.resolve(modal) : new Promise((resolve) => waiters.push(resolve));
}
export function confirmModal(modal: Modal, confirmed: boolean): void {
	(modal as unknown as { resolve(value: boolean): void }).resolve(confirmed);
}
