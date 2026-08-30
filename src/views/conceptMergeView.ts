import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type {
	ConceptMergeSuggestion,
	ConceptSummary,
} from "../models/conceptLibrary";
import type {
	ConceptMergeAiClassification,
	ConceptMergeAiInspection,
} from "../services/conceptMergeAiService";
import { ConceptMergeAiService } from "../services/conceptMergeAiService";
import {
	applyConceptMergeDraft,
	createManualConceptMergeDraft,
	type ConceptMergeDraft,
} from "../services/conceptMergeDraft";
import type { ConceptMergePlan } from "../services/conceptMergeService";
import { ConceptMergeService } from "../services/conceptMergeService";
import { rankConceptMergeCandidates } from "../services/conceptDuplicateDetector";
import type { ConceptScanner } from "../services/conceptScanner";
import {
	composeConceptDisplayTitle,
	shouldOfferEnglishAlias,
} from "../services/conceptNaming";
import { confirmConceptMerge } from "../modals/conceptMergeConfirmationModal";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";
import { formatUserFacingError } from "../utils/userFacingError";

export const CONCEPT_MERGE_VIEW_TYPE = "mneme-concept-merge-view";

export interface ConceptMergeViewActions {
	aiService: ConceptMergeAiService;
	englishAliasesEnabled(): boolean;
	getDismissedPairKeys?(): string[];
	mergeService: ConceptMergeService;
	onMerged(): Promise<void> | void;
	openConcept(concept: ConceptSummary): Promise<void> | void;
	readMarkdown(path: string): Promise<string>;
	reviewCards(conceptId: string): Promise<unknown> | unknown;
}

export class MnemeConceptMergeView extends ItemView {
	private concepts: ConceptSummary[] = [];
	private draft?: ConceptMergeDraft;
	private finalSurvivorMarkdown?: string;
	private firstConceptId?: string;
	private inspections = new Map<string, ConceptMergeAiInspection>();
	private isWorking = false;
	private plan?: ConceptMergePlan;
	private secondConceptId?: string;
	private statusMessage = "Loading Concepts...";
	private survivorConceptId?: string;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly scanner: ConceptScanner,
		private readonly actions: ConceptMergeViewActions,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CONCEPT_MERGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Merge Concepts";
	}

	getIcon(): string {
		return "git-merge";
	}

	protected async onOpen(): Promise<void> {
		this.render();
		await this.refresh();
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async refresh(first?: ConceptSummary, second?: ConceptSummary): Promise<void> {
		try {
			this.concepts = await this.scanner.scanConcepts();
			if (first) this.firstConceptId = first.conceptId;
			if (second) this.secondConceptId = second.conceptId;
			if (this.firstConceptId && !this.concepts.some((concept) => concept.conceptId === this.firstConceptId)) {
				this.firstConceptId = undefined;
			}
			if (this.secondConceptId && !this.concepts.some((concept) => concept.conceptId === this.secondConceptId)) {
				this.secondConceptId = undefined;
			}
			if (this.firstConceptId === this.secondConceptId) this.secondConceptId = undefined;
			this.survivorConceptId = this.survivorConceptId
				&& [this.firstConceptId, this.secondConceptId].includes(this.survivorConceptId)
				? this.survivorConceptId
				: this.firstConceptId;
			this.statusMessage = this.concepts.length < 2
				? "At least two approved Concepts are required."
				: "Choose two Concepts. Mneme will not write anything until you confirm the Merge.";
		} catch (error) {
			console.error("Mneme: failed to load Merge Concepts", error);
			this.concepts = [];
			this.statusMessage = formatUserFacingError(error, "Reopen Merge Concepts and try again.");
		}
		this.render();
	}

	async setSelection(first: ConceptSummary, second?: ConceptSummary): Promise<void> {
		this.clearDraft();
		await this.refresh(first, second);
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");
		this.contentEl.addClass("mneme-concept-merge-view");
		const shellEl = this.contentEl.createDiv({ cls: "mneme-concept-merge-shell" });
		this.renderHeader(shellEl);
		this.renderSelection(shellEl);
		if (this.draft) this.renderDraftEditor(shellEl);
	}

	private renderHeader(parentEl: HTMLElement): void {
		const headerEl = parentEl.createDiv({ cls: "mneme-review-header" });
		const titleEl = headerEl.createDiv();
		titleEl.createEl("h2", { cls: "mneme-review-title", text: "Merge Concepts" });
		titleEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Combine two approved Concepts without changing Card IDs or FSRS history.",
		});
		parentEl.createEl("p", { cls: "mneme-review-status", text: this.statusMessage });
	}

	private renderSelection(parentEl: HTMLElement): void {
		const sectionEl = parentEl.createDiv({ cls: "mneme-concept-merge-section" });
		sectionEl.createEl("h3", { text: "1. Choose Concepts" });
		const gridEl = sectionEl.createDiv({ cls: "mneme-concept-merge-selection" });
		this.createConceptPicker(gridEl, "Concept A", this.firstConceptId, (conceptId) => {
			this.firstConceptId = conceptId;
			if (this.secondConceptId === conceptId) this.secondConceptId = undefined;
			this.survivorConceptId = conceptId;
			this.inspections.clear();
			this.clearDraft();
			this.render();
		});
		this.createConceptPicker(gridEl, "Concept B", this.secondConceptId, (conceptId) => {
			this.secondConceptId = conceptId === this.firstConceptId ? undefined : conceptId;
			this.inspections.clear();
			this.clearDraft();
			this.render();
		});

		const first = this.getConcept(this.firstConceptId);
		if (first) this.renderSuggestions(sectionEl, first);
		const second = this.getConcept(this.secondConceptId);
		if (!first || !second) return;

		const identityEl = sectionEl.createDiv({ cls: "mneme-concept-merge-identity" });
		identityEl.createEl("strong", { text: "Keep stable identity from" });
		this.createIdentityRadio(identityEl, first);
		this.createIdentityRadio(identityEl, second);
		const actionsEl = sectionEl.createDiv({ cls: "mneme-review-actions" });
		const manualButton = actionsEl.createEl("button", { text: "Start Manual Draft" });
		manualButton.addEventListener("click", () => this.startManualDraft(first, second));
		const aiButton = actionsEl.createEl("button", { text: "Draft with AI" });
		aiButton.disabled = this.isWorking;
		aiButton.addEventListener("click", () => void this.startAiDraft(first, second, aiButton));
	}

	private createConceptPicker(
		parentEl: HTMLElement,
		label: string,
		value: string | undefined,
		onChange: (conceptId: string | undefined) => void,
	): void {
		const labelEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: label });
		const input = labelEl.createEl("input", {
			attr: { placeholder: "Search by title or ID", type: "search" },
		});
		const listId = `mneme-merge-${label.replace(/\s+/g, "-").toLocaleLowerCase()}-${Date.now()}`;
		input.setAttr("list", listId);
		const datalist = labelEl.createEl("datalist", { attr: { id: listId } });
		const labels = new Map<string, string>();
		for (const concept of this.concepts) {
			const optionLabel = this.conceptOptionLabel(concept);
			labels.set(optionLabel, concept.conceptId);
			datalist.createEl("option", { value: optionLabel });
		}
		const selected = this.getConcept(value);
		input.value = selected ? this.conceptOptionLabel(selected) : "";
		input.addEventListener("change", () => {
			const conceptId = labels.get(input.value.trim())
				?? this.concepts.find((concept) => concept.conceptId === input.value.trim())?.conceptId;
			if (!conceptId && input.value.trim()) {
				new Notice("Mneme: choose a Concept from the list.");
				input.value = selected ? this.conceptOptionLabel(selected) : "";
				return;
			}
			onChange(conceptId);
		});
	}

	private renderSuggestions(parentEl: HTMLElement, first: ConceptSummary): void {
		const dismissed = new Set(this.actions.getDismissedPairKeys?.() ?? []);
		const suggestions = rankConceptMergeCandidates(first, this.concepts, 8)
			.filter((suggestion) => suggestion.score >= 0.2)
			.filter((suggestion) => !dismissed.has(suggestion.pairKey));
		const detailsEl = parentEl.createEl("details", { cls: "mneme-concept-merge-suggestions" });
		detailsEl.open = !this.secondConceptId;
		detailsEl.createEl("summary", { text: `Suggested candidates (${suggestions.length})` });
		const listEl = detailsEl.createDiv({ cls: "mneme-concept-merge-suggestion-list" });
		for (const suggestion of suggestions) this.renderSuggestion(listEl, suggestion);
		if (suggestions.length > 0) {
			const inspectButton = detailsEl.createEl("button", { text: "Inspect Shortlist with AI" });
			inspectButton.disabled = this.isWorking;
			inspectButton.addEventListener("click", () => void this.inspectWithAi(first, suggestions, inspectButton));
		}
		detailsEl.createEl("small", {
			text: "Suggestions are local and diagnostic. Manual selection always remains available.",
		});
	}

	private renderSuggestion(parentEl: HTMLElement, suggestion: ConceptMergeSuggestion): void {
		const rowEl = parentEl.createDiv({ cls: "mneme-concept-merge-suggestion" });
		const textEl = rowEl.createDiv();
		textEl.createEl("strong", { text: suggestion.concept.title });
		const inspection = this.inspections.get(suggestion.concept.conceptId);
		textEl.createEl("small", {
			text: inspection
				? `${formatClassification(inspection.classification)} · ${inspection.reason}`
				: `${Math.round(suggestion.score * 100)}% local similarity · ${suggestion.reasons.join(" · ")}`,
		});
		rowEl.createEl("button", { text: "Choose" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.secondConceptId = suggestion.concept.conceptId;
				this.clearDraft();
				this.render();
			});
		});
	}

	private createIdentityRadio(parentEl: HTMLElement, concept: ConceptSummary): void {
		const labelEl = parentEl.createEl("label");
		const radio = labelEl.createEl("input", {
			attr: { name: "mneme-merge-survivor", type: "radio", value: concept.conceptId },
		});
		radio.checked = this.survivorConceptId === concept.conceptId;
		labelEl.createSpan({ text: concept.title });
		radio.addEventListener("change", () => {
			if (!radio.checked) return;
			this.survivorConceptId = concept.conceptId;
			this.clearDraft();
			this.render();
		});
	}

	private startManualDraft(first: ConceptSummary, second: ConceptSummary): void {
		const survivor = this.getSurvivor(first, second);
		this.draft = createManualConceptMergeDraft(first, second, survivor);
		this.plan = undefined;
		this.finalSurvivorMarkdown = undefined;
		this.statusMessage = "Manual draft created. Review the merged learning content before merging.";
		this.render();
	}

	private async startAiDraft(
		first: ConceptSummary,
		second: ConceptSummary,
		button: HTMLButtonElement,
	): Promise<void> {
		if (this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		this.statusMessage = "Drafting merged learning content...";
		this.render();
		try {
			const [firstMarkdown, secondMarkdown] = await Promise.all([
				this.actions.readMarkdown(first.path),
				this.actions.readMarkdown(second.path),
			]);
			const aiDraft = await this.actions.aiService.draftMerge({
				first,
				firstMarkdown,
				second,
				secondMarkdown,
			});
			const deterministic = createManualConceptMergeDraft(first, second, this.getSurvivor(first, second));
			this.draft = {
				...deterministic,
				...aiDraft,
				englishName: aiDraft.englishName ?? deterministic.englishName,
			};
			this.clearPreview();
			this.statusMessage = "AI draft is ready. You must review and edit it before Merge.";
		} catch (error) {
			console.error("Mneme: AI Merge draft failed", error);
			this.statusMessage = formatUserFacingError(error, "Use Start Manual Draft instead.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			this.render();
		}
	}

	private renderDraftEditor(parentEl: HTMLElement): void {
		const draft = this.draft;
		if (!draft) return;
		const sectionEl = parentEl.createDiv({ cls: "mneme-concept-merge-section" });
		sectionEl.createEl("h3", { text: "2. Edit Merged Concept" });
		const titleInput = this.createTextInput(sectionEl, "Title", draft.title);
		const englishField = this.createTextInputField(sectionEl, "English Alias (optional)", draft.englishName);
		const englishInput = englishField.inputEl;
		let observedTitle = titleInput.value.trim();
		const updateEnglishNameUi = (titleChanged: boolean): void => {
			const title = titleInput.value.trim();
			const shouldShow = this.actions.englishAliasesEnabled()
				&& !!title
				&& shouldOfferEnglishAlias(title);
			englishField.fieldEl.toggleClass("is-hidden", !shouldShow);
			if (titleChanged) {
				englishInput.value = "";
			}
		};
		updateEnglishNameUi(false);
		const first = this.getConcept(this.firstConceptId);
		const sourcePath = first?.path ?? "";
		const coreInput = createMarkdownLivePreviewField({
			app: this.app,
			component: this,
			label: "Core Meaning",
			parentEl: sectionEl,
			placeholder: "State the merged Concept's durable meaning.",
			sourcePath,
			value: draft.coreMeaning,
		});
		const whyInput = createMarkdownLivePreviewField({
			app: this.app,
			component: this,
			label: "Why It Matters (optional)",
			parentEl: sectionEl,
			placeholder: "Explain why the merged Concept is useful.",
			sourcePath,
			value: draft.whyItMatters,
		});
		const updateDraft = (): void => {
			const title = titleInput.value.trim();
			const titleUnchanged = title === draft.title.trim();
			this.draft = {
				...draft,
				coreMeaning: coreInput.value,
				englishName: this.actions.englishAliasesEnabled() && shouldOfferEnglishAlias(title)
					? englishInput.value
					: titleUnchanged
						? draft.englishName
						: "",
				title: titleInput.value,
				whyItMatters: whyInput.value,
			};
			this.clearPreview();
		};
		titleInput.addEventListener("input", () => {
			const nextTitle = titleInput.value.trim();
			if (nextTitle !== observedTitle) {
				observedTitle = nextTitle;
				updateEnglishNameUi(true);
			}
			updateDraft();
		});
		for (const input of [englishInput, coreInput, whyInput]) {
			input.addEventListener("input", updateDraft);
		}

		const originals = sectionEl.createEl("details", { cls: "mneme-review-details" });
		originals.createEl("summary", { text: "Original Concepts" });
		void this.renderOriginalConcepts(originals);
		const mergeButton = sectionEl.createEl("button", { cls: "mod-cta", text: "Merge Concepts…" });
		mergeButton.disabled = this.isWorking;
		mergeButton.addEventListener("click", () => {
			updateDraft();
			void this.requestMergeConfirmation(mergeButton);
		});
	}

	private async renderOriginalConcepts(parentEl: HTMLElement): Promise<void> {
		const concepts = [this.getConcept(this.firstConceptId), this.getConcept(this.secondConceptId)]
			.filter((concept): concept is ConceptSummary => !!concept);
		for (const concept of concepts) {
			const articleEl = parentEl.createDiv({ cls: "mneme-concept-merge-original" });
			articleEl.createEl("h4", { text: concept.title });
			try {
				await MarkdownRenderer.render(
					this.app,
					await this.actions.readMarkdown(concept.path),
					articleEl,
					concept.path,
					this,
				);
			} catch {
				articleEl.createEl("p", { cls: "mneme-review-error", text: "Original Concept could not be rendered." });
			}
		}
	}

	private createTextInput(parentEl: HTMLElement, label: string, value: string): HTMLInputElement {
		return this.createTextInputField(parentEl, label, value).inputEl;
	}

	private createTextInputField(
		parentEl: HTMLElement,
		label: string,
		value: string,
	): { fieldEl: HTMLLabelElement; inputEl: HTMLInputElement } {
		const fieldEl = parentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		fieldEl.createEl("span", { text: label });
		const input = fieldEl.createEl("input", { attr: { spellcheck: "true", type: "text" } });
		input.value = value;
		return { fieldEl, inputEl: input };
	}

	private async requestMergeConfirmation(button: HTMLButtonElement): Promise<void> {
		const first = this.getConcept(this.firstConceptId);
		const second = this.getConcept(this.secondConceptId);
		const draft = this.draft;
		if (!first || !second || !draft || this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		let preparedPlan: ConceptMergePlan | undefined;
		let preparedMarkdown: string | undefined;
		try {
			const survivor = this.getSurvivor(first, second);
			const effectiveDraft = shouldOfferEnglishAlias(draft.title)
				? draft
				: { ...draft, englishName: "" };
			const effectiveSurvivor: ConceptSummary = {
				...survivor,
				englishName: effectiveDraft.englishName.trim() || undefined,
				primaryTitle: effectiveDraft.title.trim(),
				title: composeConceptDisplayTitle(effectiveDraft.title, effectiveDraft.englishName),
			};
			const merged = survivor.conceptId === first.conceptId ? second : first;
			const result = await this.actions.mergeService.prepare({
				merged,
				preserveMergedAsView: true,
				survivor: effectiveSurvivor,
			});
			if (result.status === "blocked") {
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
			} else {
				const survivorWrite = result.plan.writes.find((write) => write.path === effectiveSurvivor.path);
				if (!survivorWrite) throw new Error("Surviving Concept preview is missing.");
				this.draft = effectiveDraft;
				preparedPlan = result.plan;
				preparedMarkdown = applyConceptMergeDraft(survivorWrite.after, effectiveDraft);
			}
		} catch (error) {
			console.error("Mneme: failed to prepare Merge preview", error);
			this.statusMessage = formatUserFacingError(error, "Review the selected Concepts and try again.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			button.disabled = false;
		}
		if (!preparedPlan || !preparedMarkdown) {
			this.render();
			return;
		}
		const plan = preparedPlan;
		const finalMarkdown = preparedMarkdown;

		const confirmed = await confirmConceptMerge(this.app, {
			changes: plan.writes.map((write) => ({
				after: write.path === plan.survivor.path ? finalMarkdown : write.after,
				before: write.before,
				label: write.label,
				path: write.path,
			})),
			description: `${plan.merged.title} becomes a Redirect Note. Card IDs and FSRS history remain unchanged.`,
			impact: `${plan.sourceLinksPreserved} Source Notes · ${plan.relatedConceptsRewired} Related links updated · ${plan.cardsPreserved} Cards preserved`,
		});
		if (!confirmed) {
			this.statusMessage = "Merge cancelled. No vault content changed.";
			this.clearPreview();
			this.render();
			return;
		}

		this.plan = plan;
		this.finalSurvivorMarkdown = finalMarkdown;
		button.disabled = true;
		await this.executeMerge();
	}

	private async executeMerge(): Promise<void> {
		if (!this.plan || !this.finalSurvivorMarkdown || this.isWorking) return;
		this.isWorking = true;
		const plan = this.plan;
		let completed = false;
		try {
			const result = await this.actions.mergeService.execute(plan, this.finalSurvivorMarkdown);
			if (result.status !== "merged") {
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			completed = true;
			try {
				await this.actions.onMerged();
			} catch (refreshError) {
				console.error("Mneme: Merge succeeded but dependent views did not refresh", refreshError);
				new Notice("Mneme: Merge succeeded. Reopen or refresh other Mneme views if they look stale.");
			}
			this.renderSuccess(plan.survivor);
			new Notice("Mneme: Concepts merged. Card IDs and FSRS history preserved.");
		} catch (error) {
			console.error("Mneme: Merge failed", error);
			this.statusMessage = formatUserFacingError(error, "No partial Merge was kept if rollback succeeded.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			if (!completed) this.render();
		}
	}

	private renderSuccess(survivor: ConceptSummary): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view");
		this.contentEl.addClass("mneme-concept-merge-view");
		const shellEl = this.contentEl.createDiv({ cls: "mneme-concept-merge-shell" });
		shellEl.createEl("h2", { text: "Merge Complete" });
		shellEl.createEl("p", { text: `${survivor.title} now contains the merged knowledge.` });
		const actionsEl = shellEl.createDiv({ cls: "mneme-review-actions" });
		actionsEl.createEl("button", { text: "View Merged Concept" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.actions.openConcept(survivor));
		});
		actionsEl.createEl("button", { text: "Review Merged Cards" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => void this.actions.reviewCards(survivor.conceptId));
		});
		actionsEl.createEl("button", { text: "Merge Another Pair" }, (buttonEl) => {
			buttonEl.addEventListener("click", () => {
				this.firstConceptId = undefined;
				this.secondConceptId = undefined;
				this.survivorConceptId = undefined;
				this.inspections.clear();
				this.clearDraft();
				void this.refresh();
			});
		});
	}

	private async inspectWithAi(
		first: ConceptSummary,
		suggestions: ConceptMergeSuggestion[],
		button: HTMLButtonElement,
	): Promise<void> {
		if (this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		try {
			const results = await this.actions.aiService.inspectCandidates({
				candidates: suggestions.map((suggestion) => suggestion.concept),
				selected: first,
			});
			this.inspections = new Map(results.map((result) => [result.conceptId, result]));
			this.statusMessage = "AI classified the local shortlist. You still choose whether to Merge.";
		} catch (error) {
			console.error("Mneme: AI duplicate inspection failed", error);
			this.statusMessage = formatUserFacingError(error, "Use local suggestions or manual selection.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			this.render();
		}
	}

	private getConcept(conceptId: string | undefined): ConceptSummary | undefined {
		return conceptId ? this.concepts.find((concept) => concept.conceptId === conceptId) : undefined;
	}

	private getSurvivor(first: ConceptSummary, second: ConceptSummary): ConceptSummary {
		return this.survivorConceptId === second.conceptId ? second : first;
	}

	private conceptOptionLabel(concept: ConceptSummary): string {
		return `${concept.title} · ${concept.conceptId}`;
	}

	private clearDraft(): void {
		this.draft = undefined;
		this.clearPreview();
	}

	private clearPreview(): void {
		this.plan = undefined;
		this.finalSurvivorMarkdown = undefined;
	}
}

function formatClassification(value: ConceptMergeAiClassification): string {
	return ({
		likely_duplicate: "Likely duplicate",
		overlapping_but_distinct: "Overlapping but distinct",
		related: "Related",
		uncertain: "Uncertain",
	})[value];
}
