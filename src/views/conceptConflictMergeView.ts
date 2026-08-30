import {
	ItemView,
	MarkdownRenderer,
	Notice,
	WorkspaceLeaf,
} from "obsidian";
import type { ConceptSummary } from "../models/conceptLibrary";
import type { ConceptConflictMergeDraftRecord } from "../models/conceptConflictMergeDraft";
import type { ConceptMergeAiService } from "../services/conceptMergeAiService";
import type { ConceptConflictMergeDraftStore } from "../services/conceptConflictMergeDraftStore";
import {
	createManualConceptMergeDraft,
	type ConceptMergeDraft,
} from "../services/conceptMergeDraft";
import {
	type IncomingConceptMergePlan,
	type IncomingConceptMergeService,
	type PrepareIncomingConceptMergeInput,
} from "../services/incomingConceptMergeService";
import {
	shouldOfferEnglishAlias,
} from "../services/conceptNaming";
import { confirmConceptMerge } from "../modals/conceptMergeConfirmationModal";
import { createMarkdownLivePreviewField } from "../ui/markdownLivePreviewField";
import { formatUserFacingError } from "../utils/userFacingError";

export const CONCEPT_CONFLICT_MERGE_VIEW_TYPE = "mneme-concept-conflict-merge-view";

export interface ConceptConflictMergeSession {
	existing: ConceptSummary;
	incoming: ConceptSummary;
	incomingFingerprint: string;
	incomingMarkdown: string;
	key: string;
	onReturn(): Promise<void> | void;
	origin: PrepareIncomingConceptMergeInput["origin"];
}

export interface ConceptConflictMergeViewActions {
	aiService: ConceptMergeAiService;
	draftStore: ConceptConflictMergeDraftStore;
	englishAliasesEnabled(): boolean;
	mergeService: IncomingConceptMergeService;
	onMerged(session: ConceptConflictMergeSession): Promise<void> | void;
	readMarkdown(path: string): Promise<string>;
	shouldReturnOnClose(): boolean;
}

export class MnemeConceptConflictMergeView extends ItemView {
	private completed = false;
	private commitPromise?: Promise<void>;
	private draft?: ConceptMergeDraft;
	private isClosed = false;
	private isWorking = false;
	private plan?: IncomingConceptMergePlan;
	private returnHandled = false;
	private saveQueue: Promise<void> = Promise.resolve();
	private saveTimer?: number;
	private session?: ConceptConflictMergeSession;
	private statusMessage = "No name-conflict Merge is active.";

	constructor(
		leaf: WorkspaceLeaf,
		private readonly actions: ConceptConflictMergeViewActions,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CONCEPT_CONFLICT_MERGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Merge Concepts";
	}

	getIcon(): string {
		return "git-merge";
	}

	getSessionKey(): string | undefined {
		return this.session?.key;
	}

	protected async onOpen(): Promise<void> {
		this.isClosed = false;
		this.render();
	}

	protected async onClose(): Promise<void> {
		if (this.commitPromise) {
			await this.commitPromise;
		}
		this.isClosed = true;
		if (this.session && this.draft && !this.completed) {
			try {
				await this.flushDraft();
			} catch (error) {
				console.error("Mneme: failed to save conflict Merge draft on close", error);
			}
		}
		const shouldReturn = !!this.session
			&& !this.completed
			&& !this.returnHandled
			&& this.actions.shouldReturnOnClose();
		const onReturn = this.session?.onReturn;
		this.contentEl.empty();
		if (shouldReturn && onReturn) {
			try {
				await onReturn();
			} catch (error) {
				console.error("Mneme: failed to return from conflict Merge", error);
				new Notice("Mneme: Your incoming Concept is still saved. Reopen Inbox or Create Concept.");
			}
		}
	}

	async setSession(session: ConceptConflictMergeSession): Promise<void> {
		if (this.session && this.draft) await this.flushDraft();
		this.session = session;
		this.completed = false;
		this.returnHandled = false;
		this.plan = undefined;
		const stored = await this.actions.draftStore.getDraft(session.key);
		if (
			stored
			&& stored.existingConceptId === session.existing.conceptId
			&& stored.incomingFingerprint === session.incomingFingerprint
		) {
			this.draft = cloneDraft(stored.draft);
			this.statusMessage = "Saved Merge draft restored. No vault content has changed.";
		} else {
			if (stored) await this.actions.draftStore.clearDraft(session.key);
			this.draft = createManualConceptMergeDraft(
				session.existing,
				session.incoming,
				session.existing,
			);
			this.statusMessage = "Review the merged learning content. Nothing is written until Confirm Merge.";
			await this.persistDraft();
		}
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("mneme-review-view", "mneme-concept-merge-view");
		const shellEl = this.contentEl.createDiv({ cls: "mneme-concept-merge-shell" });
		const headerEl = shellEl.createDiv({ cls: "mneme-review-header" });
		const titleEl = headerEl.createDiv();
		titleEl.createEl("h2", { cls: "mneme-review-title", text: "Merge Concepts" });
		titleEl.createEl("p", {
			cls: "mneme-review-subtitle",
			text: "Resolve the incoming Concept without creating a separate Concept first.",
		});

		if (!this.session || !this.draft) {
			shellEl.createEl("p", { cls: "mneme-review-status", text: this.statusMessage });
			return;
		}

		headerEl.createEl("button", { text: "Back to Conflict Options" }, (buttonEl) => {
			buttonEl.disabled = this.isWorking;
			buttonEl.addEventListener("click", () => void this.returnToConflictOptions());
		});
		shellEl.createEl("p", { cls: "mneme-review-status", text: this.statusMessage });
		this.renderComparison(shellEl);
		this.renderDraftEditor(shellEl);
	}

	private renderComparison(parentEl: HTMLElement): void {
		const session = this.session;
		if (!session) return;
		const sectionEl = parentEl.createDiv({ cls: "mneme-concept-merge-section" });
		sectionEl.createEl("h3", { text: "1. Review Conflict" });
		const comparisonEl = sectionEl.createDiv({ cls: "mneme-concept-name-conflict-comparison" });
		this.renderConceptCard(comparisonEl, "Existing Concept", session.existing);
		this.renderConceptCard(comparisonEl, "Incoming Concept", session.incoming, session.incomingMarkdown);
		sectionEl.createEl("p", {
			cls: "mneme-review-status",
			text: `Stable identity remains ${session.existing.conceptId}. The incoming side is still a draft.`,
		});
	}

	private renderConceptCard(
		parentEl: HTMLElement,
		label: string,
		concept: ConceptSummary,
		markdown?: string,
	): void {
		const cardEl = parentEl.createEl("article", { cls: "mneme-concept-name-conflict-item" });
		cardEl.createEl("strong", { cls: "mneme-concept-name-conflict-label", text: label });
		cardEl.createEl("h3", {
			cls: "mneme-concept-library-card-title",
			text: concept.title,
		});
		const meaningEl = cardEl.createDiv({
			cls: "mneme-concept-library-card-meaning mneme-concept-name-conflict-meaning",
		});
		void MarkdownRenderer.render(
			this.app,
			concept.coreMeaning?.trim() || "No Core Meaning yet.",
			meaningEl,
			markdown ? "" : concept.path,
			this,
		).catch((error) => {
			console.error("Mneme: failed to render conflict Merge Concept", error);
			meaningEl.empty();
			meaningEl.setText(concept.coreMeaning?.trim() || "No Core Meaning yet.");
		});
	}

	private renderDraftEditor(parentEl: HTMLElement): void {
		const session = this.session;
		const draft = this.draft;
		if (!session || !draft) return;
		const sectionEl = parentEl.createDiv({ cls: "mneme-concept-merge-section" });
		const headingEl = sectionEl.createDiv({ cls: "mneme-concept-conflict-merge-step-heading" });
		headingEl.createEl("h3", { text: "2. Edit Merged Concept" });
		const aiButton = headingEl.createEl("button", { text: "Draft with AI" });
		aiButton.disabled = this.isWorking;
		aiButton.addEventListener("click", () => void this.draftWithAi(aiButton));

		const titleInput = this.createTextInput(sectionEl, "Title", draft.title);
		const englishField = this.createTextInputField(sectionEl, "English Alias (optional)", draft.englishName);
		const englishInput = englishField.inputEl;
		let observedTitle = titleInput.value.trim();
		const updateEnglishUi = (): void => {
			const shouldShow = this.actions.englishAliasesEnabled()
				&& shouldOfferEnglishAlias(titleInput.value);
			englishField.fieldEl.toggleClass("is-hidden", !shouldShow);
			if (!shouldShow) englishInput.value = "";
		};
		updateEnglishUi();

		const coreInput = createMarkdownLivePreviewField({
			app: this.app,
			component: this,
			label: "Core Meaning",
			parentEl: sectionEl,
			placeholder: "State the merged Concept's durable meaning.",
			sourcePath: session.existing.path,
			value: draft.coreMeaning,
		});
		const whyInput = createMarkdownLivePreviewField({
			app: this.app,
			component: this,
			label: "Why It Matters (optional)",
			parentEl: sectionEl,
			placeholder: "Explain why the merged Concept is useful.",
			sourcePath: session.existing.path,
			value: draft.whyItMatters,
		});
		const updateDraft = (): void => {
			const current = this.draft ?? draft;
			this.draft = {
				...current,
				coreMeaning: coreInput.value,
				englishName: englishInput.value,
				title: titleInput.value,
				whyItMatters: whyInput.value,
			};
			this.plan = undefined;
			this.scheduleDraftSave();
		};
		titleInput.addEventListener("input", () => {
			const nextTitle = titleInput.value.trim();
			if (nextTitle !== observedTitle) {
				observedTitle = nextTitle;
				englishInput.value = "";
			}
			updateEnglishUi();
			updateDraft();
		});
		for (const input of [englishInput, coreInput, whyInput]) {
			input.addEventListener("input", updateDraft);
		}

		const mergeButton = sectionEl.createEl("button", { cls: "mod-cta", text: "Merge Concepts…" });
		mergeButton.disabled = this.isWorking;
		mergeButton.addEventListener("click", () => {
			updateDraft();
			void this.requestMergeConfirmation(mergeButton);
		});
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
		const inputEl = fieldEl.createEl("input", { attr: { spellcheck: "true", type: "text" } });
		inputEl.value = value;
		return { fieldEl, inputEl };
	}

	private async draftWithAi(button: HTMLButtonElement): Promise<void> {
		const session = this.session;
		const draft = this.draft;
		if (!session || !draft || this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		this.statusMessage = "Drafting merged learning content...";
		this.render();
		try {
			const aiDraft = await this.actions.aiService.draftMerge({
				first: session.existing,
				firstMarkdown: await this.actions.readMarkdown(session.existing.path),
				second: session.incoming,
				secondMarkdown: session.incomingMarkdown,
			});
			this.draft = {
				...draft,
				...aiDraft,
				englishName: aiDraft.englishName ?? draft.englishName,
			};
			this.plan = undefined;
			await this.persistDraft();
			this.statusMessage = "AI draft is ready. Review and edit it before merging.";
		} catch (error) {
			console.error("Mneme: conflict Merge AI draft failed", error);
			this.statusMessage = formatUserFacingError(error, "Continue with the Manual draft.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			if (!this.isClosed) this.render();
		}
	}

	private async requestMergeConfirmation(button: HTMLButtonElement): Promise<void> {
		const session = this.session;
		const draft = this.draft;
		if (!session || !draft || this.isWorking) return;
		this.isWorking = true;
		button.disabled = true;
		let preparedPlan: IncomingConceptMergePlan | undefined;
		try {
			await this.flushDraft();
			const result = await this.actions.mergeService.prepare({
				draft: this.actions.englishAliasesEnabled() && shouldOfferEnglishAlias(draft.title)
					? draft
					: { ...draft, englishName: "" },
				existing: session.existing,
				origin: session.origin,
			});
			if (result.status === "blocked") {
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
			} else {
				preparedPlan = result.plan;
			}
		} catch (error) {
			console.error("Mneme: failed to prepare conflict Merge preview", error);
			this.statusMessage = formatUserFacingError(error, "Return to the conflict options and try again.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			button.disabled = false;
		}
		if (!preparedPlan) {
			if (!this.isClosed) this.render();
			return;
		}

		const confirmed = await confirmConceptMerge(this.app, {
			changes: [{
				after: preparedPlan.after,
				before: preparedPlan.before,
				label: "Existing Concept",
				path: preparedPlan.existing.path,
			}],
			description: "The existing Concept will be updated in place. No Redirect Note or -2 path will be created.",
			impact: `${preparedPlan.sourceLinksAdded} Source Notes · ${preparedPlan.viewsAdded} Views · no duplicate Concept created`,
		});
		if (!confirmed || this.isClosed) {
			this.statusMessage = "Merge cancelled. No vault content changed.";
			if (!this.isClosed) this.render();
			return;
		}

		this.plan = preparedPlan;
		button.disabled = true;
		const commit = this.executeMerge();
		this.commitPromise = commit;
		void commit.finally(() => {
			if (this.commitPromise === commit) this.commitPromise = undefined;
		});
	}

	private async executeMerge(): Promise<void> {
		const plan = this.plan;
		if (!plan || this.isWorking) return;
		this.isWorking = true;
		try {
			const result = await this.actions.mergeService.execute(plan);
			if (result.status !== "merged") {
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			this.completed = true;
			let refreshFailed = false;
			if (this.session) {
				try {
					await this.actions.onMerged(this.session);
				} catch (error) {
					refreshFailed = true;
					console.error("Mneme: conflict Merge completed but dependent views could not refresh", error);
				}
			}
			this.contentEl.empty();
			this.contentEl.addClass("mneme-review-view", "mneme-concept-merge-view");
			const shellEl = this.contentEl.createDiv({ cls: "mneme-concept-merge-shell" });
			shellEl.createEl("h2", { text: "Merge Complete" });
			shellEl.createEl("p", {
				text: `${plan.existing.title} was updated without creating a duplicate Concept.`,
			});
			if (refreshFailed) {
				shellEl.createEl("p", {
					cls: "mneme-review-status",
					text: "The Merge is saved. Reopen Mneme views to refresh them.",
				});
			}
			new Notice("Mneme: Concepts merged. No duplicate Concept was created.");
			if (refreshFailed) {
				new Notice("Mneme: Merge completed, but dependent views could not refresh.");
			}
		} catch (error) {
			console.error("Mneme: conflict Merge failed", error);
			this.statusMessage = formatUserFacingError(error, "Your incoming Concept remains saved.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			this.isWorking = false;
			if (!this.completed && !this.isClosed) this.render();
		}
	}

	private async returnToConflictOptions(): Promise<void> {
		const session = this.session;
		if (!session || this.isWorking) return;
		await this.flushDraft();
		this.returnHandled = true;
		this.leaf.detach();
		await session.onReturn();
	}

	private scheduleDraftSave(): void {
		if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = undefined;
			void this.persistDraft().catch((error) => {
				console.error("Mneme: failed to auto-save conflict Merge draft", error);
			});
		}, 250);
	}

	private async flushDraft(): Promise<void> {
		if (this.saveTimer !== undefined) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = undefined;
		}
		await this.persistDraft();
	}

	private persistDraft(): Promise<void> {
		const session = this.session;
		const draft = this.draft;
		if (!session || !draft) return Promise.resolve();
		const record: ConceptConflictMergeDraftRecord = {
			draft: cloneDraft(draft),
			existingConceptId: session.existing.conceptId,
			incomingFingerprint: session.incomingFingerprint,
			key: session.key,
			updatedAt: new Date().toISOString(),
		};
		this.saveQueue = this.saveQueue
			.catch(() => undefined)
			.then(() => this.actions.draftStore.saveDraft(record));
		return this.saveQueue;
	}
}

function cloneDraft(draft: ConceptMergeDraft): ConceptMergeDraft {
	return {
		...draft,
		tags: [...draft.tags],
	};
}
