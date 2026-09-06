export class Component {
	load(): void {}
	unload(): void {}
}
export class ItemView {}
export class Notice {
	static messages: string[] = [];
	constructor(message: string) { Notice.messages.push(message); }
}
export class WorkspaceLeaf {}
export const MarkdownRenderer = {};
