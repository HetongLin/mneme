import { App, Component, MarkdownRenderer } from "obsidian";

export interface MarkdownLivePreviewFieldOptions {
	app: App;
	component: Component;
	label: string;
	parentEl: HTMLElement;
	placeholder?: string;
	sourcePath: string;
	value: string;
}

let fieldId = 0;

export function createMarkdownLivePreviewField(
	options: MarkdownLivePreviewFieldOptions,
): HTMLTextAreaElement {
	const id = `mneme-markdown-live-preview-${fieldId += 1}`;
	const fieldEl = options.parentEl.createDiv({ cls: "mneme-proposal-detail-field mneme-markdown-live-preview-field" });
	fieldEl.createEl("label", {
		attr: { for: id },
		text: options.label,
	});
	const previewEl = fieldEl.createDiv({
		attr: {
			"aria-label": `Edit ${options.label}`,
			role: "button",
			tabindex: "0",
		},
		cls: "mneme-markdown-live-preview",
	});
	const textareaEl = fieldEl.createEl("textarea", {
		attr: {
			id,
			placeholder: options.placeholder ?? "",
			spellcheck: "true",
		},
		cls: "mneme-proposal-detail-field-textarea mneme-markdown-live-preview-editor",
	});
	textareaEl.value = options.value;
	textareaEl.hidden = true;

	const renderPreview = async (): Promise<void> => {
		previewEl.empty();
		const markdown = textareaEl.value.trim();
		if (!markdown) {
			previewEl.addClass("is-empty");
			previewEl.setText(options.placeholder || "Click to edit");
			return;
		}

		previewEl.removeClass("is-empty");
		try {
			await MarkdownRenderer.render(
				options.app,
				textareaEl.value,
				previewEl,
				options.sourcePath,
				options.component,
			);
		} catch (error) {
			console.error("Mneme: failed to render Markdown live preview", error);
			previewEl.setText(textareaEl.value);
		}
	};

	const showEditor = (): void => {
		previewEl.hidden = true;
		textareaEl.hidden = false;
		textareaEl.focus();
	};
	const showPreview = (): void => {
		textareaEl.hidden = true;
		previewEl.hidden = false;
		void renderPreview();
	};

	previewEl.addEventListener("click", (event) => {
		if (event.target instanceof Element && event.target.closest("a, button, input, select") !== null) return;
		showEditor();
	});
	previewEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		showEditor();
	});
	textareaEl.addEventListener("blur", () => window.setTimeout(showPreview, 0));
	textareaEl.addEventListener("keydown", (event) => {
		if (event.key === "Escape") textareaEl.blur();
	});
	void renderPreview();

	return textareaEl;
}
