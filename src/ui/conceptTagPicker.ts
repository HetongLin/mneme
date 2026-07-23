import type { ConceptTagCatalogEntry } from "../services/conceptTagCatalog";
import {
	findSimilarConceptTags,
	normalizeEnglishTagSlug,
	suggestConceptTags,
} from "../services/conceptTagCatalog";

export interface ConceptTagPickerOptions {
	catalog: ConceptTagCatalogEntry[];
	contextProvider?: () => string;
	initialTags?: string[];
	label?: string;
	onChange?(): void;
	parentEl: HTMLElement;
}

export interface ConceptTagPicker {
	getTags(): string[];
	refresh(): void;
	setCatalog(catalog: ConceptTagCatalogEntry[]): void;
	setTags(tags: string[], notify?: boolean): void;
}

let tagPickerId = 0;

export function createConceptTagPicker(options: ConceptTagPickerOptions): ConceptTagPicker {
	const id = `mneme-concept-tag-picker-${tagPickerId += 1}`;
	let catalog = [...options.catalog];
	let catalogTags = new Set(catalog.map(({ tag }) => tag));
	let selectedTags = normalizeInitialTags(options.initialTags ?? []);
	const fieldEl = options.parentEl.createDiv({ cls: "mneme-proposal-detail-field mneme-concept-tag-picker" });
	fieldEl.createEl("label", { attr: { for: id }, text: options.label ?? "Tags" });
	const selectedEl = fieldEl.createDiv({ cls: "mneme-concept-tag-picker-selected" });
	const inputEl = fieldEl.createEl("input", {
		attr: {
			autocomplete: "off",
			id,
			placeholder: "Search existing tags or create a new tag",
			type: "search",
		},
	});
	fieldEl.createEl("small", {
		text: "Use English tags. Existing tags are preferred; 1–3 tags is usually enough.",
	});
	const feedbackEl = fieldEl.createDiv({ cls: "mneme-concept-tag-picker-feedback" });
	const suggestionsEl = fieldEl.createDiv({ cls: "mneme-concept-tag-picker-suggestions" });

	const notifyChange = (): void => options.onChange?.();

	const addTag = (value: string): void => {
		const tag = normalizeEnglishTagSlug(value);
		if (!tag || selectedTags.includes(tag)) return;
		selectedTags.push(tag);
		inputEl.value = "";
		render();
		notifyChange();
	};

	const removeTag = (tag: string): void => {
		selectedTags = selectedTags.filter((selected) => selected !== tag);
		render();
		notifyChange();
	};

	const replaceTag = (current: string, replacement: string): void => {
		const replacementTag = normalizeEnglishTagSlug(replacement);
		if (!replacementTag) return;
		selectedTags = selectedTags
			.map((tag) => tag === current ? replacementTag : tag)
			.filter((tag, index, values) => values.indexOf(tag) === index);
		render();
		notifyChange();
	};

	const renderSelected = (): void => {
		selectedEl.empty();
		for (const tag of selectedTags) {
			selectedEl.createEl("button", {
				attr: { "aria-label": `Remove ${tag}` },
				cls: "mneme-concept-tag-chip",
				text: `${tag} ×`,
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => removeTag(tag));
			});
		}
	};

	const renderFeedback = (): void => {
		feedbackEl.empty();
		for (const selected of selectedTags) {
			if (catalogTags.has(selected)) continue;
			const similar = findSimilarConceptTags(selected, catalog);
			if (similar.length === 0) continue;

			const rowEl = feedbackEl.createDiv({ cls: "mneme-concept-tag-picker-similar" });
			rowEl.createSpan({ text: `“${selected}” is similar to:` });
			for (const suggestion of similar) {
				rowEl.createEl("button", { text: suggestion.tag }, (buttonEl) => {
					buttonEl.addEventListener("click", () => replaceTag(selected, suggestion.tag));
				});
			}
		}
	};

	const renderSuggestions = (): void => {
		suggestionsEl.empty();
		const query = inputEl.value.trim();
		const normalizedQuery = normalizeEnglishTagSlug(query);
		const suggestions = suggestConceptTags(catalog, {
			context: options.contextProvider?.(),
			query,
			selectedTags,
		});

		if (suggestions.length > 0) {
			const rowEl = suggestionsEl.createDiv({ cls: "mneme-concept-tag-picker-suggestion-row" });
			rowEl.createSpan({ text: query ? "Matches" : "Suggested" });
			for (const suggestion of suggestions) {
				rowEl.createEl("button", { text: suggestion.tag }, (buttonEl) => {
					buttonEl.addEventListener("click", () => addTag(suggestion.tag));
				});
			}
		}

		if (!query) return;
		if (!normalizedQuery) {
			suggestionsEl.createEl("p", {
				cls: "mneme-review-status",
				text: "New tags must use English letters, numbers, hyphens, or slashes.",
			});
			return;
		}
		if (!catalogTags.has(normalizedQuery) && !selectedTags.includes(normalizedQuery)) {
			suggestionsEl.createEl("button", {
				cls: "mneme-concept-tag-create",
				text: `Create “${normalizedQuery}”`,
			}, (buttonEl) => {
				buttonEl.addEventListener("click", () => addTag(normalizedQuery));
			});
		}
	};

	const render = (): void => {
		renderSelected();
		renderFeedback();
		renderSuggestions();
	};

	inputEl.addEventListener("input", renderSuggestions);
	inputEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		const values = inputEl.value.split(",").map((value) => value.trim()).filter(Boolean);
		for (const value of values) addTag(value);
	});
	render();

	return {
		getTags: () => [...selectedTags],
		refresh: renderSuggestions,
		setCatalog: (nextCatalog) => {
			catalog = [...nextCatalog];
			catalogTags = new Set(catalog.map(({ tag }) => tag));
			render();
		},
		setTags: (tags, notify = true) => {
			selectedTags = normalizeInitialTags(tags);
			inputEl.value = "";
			render();
			if (notify) notifyChange();
		},
	};
}

function normalizeInitialTags(tags: string[]): string[] {
	return [...new Set(tags.flatMap((value) => {
		const normalized = normalizeEnglishTagSlug(value);
		const preserved = value.trim().replace(/^#+/, "");
		return normalized ? [normalized] : preserved ? [preserved] : [];
	}))];
}
