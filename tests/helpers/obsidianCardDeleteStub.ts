export class App {}

export class Modal {
	app: App;
	closed = false;
	titleEl = { setText: (_text: string): void => {} };
	contentEl = {
		createEl: (_tag: string, _options?: unknown) => ({ addEventListener: (_event: string, _handler: () => void): void => {} }),
		createDiv: (_options?: unknown) => ({ createEl: (_tag: string, _innerOptions?: unknown) => ({ addEventListener: (_event: string, _handler: () => void): void => {} }) }),
		empty: (): void => {},
	};
	constructor(app: App) { this.app = app; }
	close(): void { this.closed = true; }
}

export class Notice {
	static messages: string[] = [];
	constructor(message: string) { Notice.messages.push(message); }
}

export class TFile {}
