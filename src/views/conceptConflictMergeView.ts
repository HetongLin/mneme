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
import type { IncomingConceptMergeReceipt } from "../services/incomingConceptMergeRecovery";

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
	private sessionRevision = 0;
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

	completeRecoveredMerge(receipt: IncomingConceptMergeReceipt): void {
		const session = this.session;
		if (this.isClosed || !session || receipt.status !== "written"
			|| session.existing.conceptId !== receipt.conceptId || session.existing.path !== receipt.path) return;
		if (receipt.origin.kind === "inbox") {
			if (session.origin.kind !== "inbox" || session.origin.proposalId !== receipt.origin.proposalId) return;
		} else if (session.origin.kind !== "manual" || session.origin.input.draftId !== receipt.origin.draftId) return;
		this.completed = true;
		this.sessionRevision++;
		if (this.saveTimer !== undefined) { window.clearTimeout(this.saveTimer); this.saveTimer = undefined; }
		this.contentEl.empty();
		this.contentEl.createEl("h2", { text: "Merge Complete" });
		this.contentEl.createEl("p", { text: "The incoming Concept Merge is saved. Reopen the Concept to see its current content." });
	}

	protected async onOpen(): Promise<void> {
		this.isClosed = false;
		this.isWorking = false;
		this.render();
	}

	protected async onClose(): Promise<void> {
		this.isClosed = true;
		this.sessionRevision++;
		this.contentEl.empty();
		if (this.commitPromise) {
			await this.commitPromise;
		}
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
		if (this.commitPromise) await this.commitPromise;
		if (this.isClosed) return;
		const revision = ++this.sessionRevision;
		this.isWorking = true;
		this.render();
		try {
			if (this.session && this.draft && !this.completed) await this.flushDraft();
			if (this.isClosed || revision !== this.sessionRevision) return;
			this.session = session;
			this.draft = undefined;
			this.completed = false;
			this.returnHandled = false;
			this.statusMessage = "Loading saved Merge draft...";
			this.render();
			const stored = await this.actions.draftStore.getDraft(session.key);
			if (!this.isCurrentSession(session, revision)) return;
			if (stored) {
				this.draft = cloneDraft(stored.draft);
				this.statusMessage = stored.existingConceptId === session.existing.conceptId
					&& stored.incomingFingerprint === session.incomingFingerprint
					? "Saved Merge draft restored. No vault content has changed."
					: "Saved Merge draft came from a different Concept or incoming revision. Its text was kept. Review every field against the current Concepts before confirming.";
			} else {
				this.draft = createManualConceptMergeDraft(session.existing, session.incoming, session.existing);
				this.statusMessage = "Review the merged learning content. Nothing is written until Confirm Merge.";
				await this.persistDraft();
			}
		} catch (error) {
			if (!this.isClosed && revision === this.sessionRevision) {
				this.statusMessage = formatUserFacingError(error, "Could not load the Merge draft. Reopen Merge to retry.");
			}
		} finally {
			if (!this.isClosed && revision === this.sessionRevision) {
				this.isWorking = false;
				this.render();
			}
		}
	}

	private isCurrentSession(session: ConceptConflictMergeSession, revision: number): boolean {
		return !this.isClosed && this.session === session && this.sessionRevision === revision;
	}

	private render(): void {
		if (this.isClosed) return;
		const session = this.session;
		const revision = this.sessionRevision;
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
			buttonEl.addEventListener("click", () => {
				if (session && this.isCurrentSession(session, revision)) void this.returnToConflictOptions();
			});
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
		const revision = this.sessionRevision;
		if (!session || !draft) return;
		const sectionEl = parentEl.createDiv({ cls: "mneme-concept-merge-section" });
		const headingEl = sectionEl.createDiv({ cls: "mneme-concept-conflict-merge-step-heading" });
		headingEl.createEl("h3", { text: "2. Edit Merged Concept" });
		const aiButton = headingEl.createEl("button", { text: "Draft with AI" });
		aiButton.disabled = this.isWorking;
		aiButton.addEventListener("click", () => {
			if (this.isCurrentSession(session, revision)) void this.draftWithAi(aiButton);
		});

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
			if (!this.isCurrentSession(session, revision) || this.isWorking || this.completed) return;
			const current = this.draft ?? draft;
			this.draft = {
				...current,
				coreMeaning: coreInput.value,
				englishName: englishInput.value,
				title: titleInput.value,
				whyItMatters: whyInput.value,
			};
			this.scheduleDraftSave();
		};
		for (const input of [titleInput, englishInput, coreInput, whyInput]) input.disabled = this.isWorking;
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
			if (!this.isCurrentSession(session, revision)) return;
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
		const revision = this.sessionRevision;
		if (!session || !draft || this.isWorking || this.isClosed || this.completed) return;
		this.isWorking = true;
		button.disabled = true;
		this.statusMessage = "Drafting merged learning content...";
		this.render();
		try {
			const firstMarkdown = await this.actions.readMarkdown(session.existing.path);
			if (!this.isCurrentSession(session, revision)) return;
			const aiDraft = await this.actions.aiService.draftMerge({
				first: session.existing,
				firstMarkdown,
				second: session.incoming,
				secondMarkdown: session.incomingMarkdown,
			});
			if (!this.isCurrentSession(session, revision)) return;
			this.draft = { ...draft, ...aiDraft, englishName: aiDraft.englishName ?? draft.englishName };
			await this.persistDraft();
			if (this.isCurrentSession(session, revision)) {
				this.statusMessage = "AI draft is ready. Review and edit it before merging.";
			}
		} catch (error) {
			if (!this.isCurrentSession(session, revision)) return;
			console.error("Mneme: conflict Merge AI draft failed", error);
			this.statusMessage = formatUserFacingError(error, "Continue with the Manual draft.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			if (this.isCurrentSession(session, revision)) {
				this.isWorking = false;
				this.render();
			}
		}
	}

	private async requestMergeConfirmation(button: HTMLButtonElement): Promise<void> {
		const session = this.session;
		const draft = this.draft;
		const revision = this.sessionRevision;
		if (!session || !draft || this.isWorking || this.isClosed || this.completed) return;
		this.isWorking = true;
		button.disabled = true;
		this.render();
		try {
			await this.flushDraft();
			if (!this.isCurrentSession(session, revision)) return;
			const result = await this.actions.mergeService.prepare({
				draft: this.actions.englishAliasesEnabled() && shouldOfferEnglishAlias(draft.title)
					? cloneDraft(draft) : { ...cloneDraft(draft), englishName: "" },
				existing: session.existing,
				origin: session.origin,
			});
			if (!this.isCurrentSession(session, revision)) return;
			if (result.status === "blocked") {
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			const plan = result.plan;
			const confirmed = await confirmConceptMerge(this.app, {
				changes: [{ after: plan.after, before: plan.before, label: "Existing Concept", path: plan.existing.path }],
				description: "The existing Concept will be updated in place. No Redirect Note or -2 path will be created.",
				impact: `${plan.sourceLinksAdded} Source Notes · ${plan.viewsAdded} Views · no duplicate Concept created`,
			});
			if (!this.isCurrentSession(session, revision)) return;
			if (!confirmed) {
				this.statusMessage = "Merge cancelled. No vault content changed.";
				return;
			}
			const commit = this.executeMerge(plan, session, revision);
			this.commitPromise = commit;
			try {
				await commit;
			} finally {
				if (this.commitPromise === commit) this.commitPromise = undefined;
			}
		} catch (error) {
			if (!this.isCurrentSession(session, revision)) return;
			console.error("Mneme: failed to prepare conflict Merge preview", error);
			this.statusMessage = formatUserFacingError(error, "Return to the conflict options and try again.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			if (this.isCurrentSession(session, revision)) {
				this.isWorking = false;
				if (!this.completed) this.render();
			}
		}
	}

	private async executeMerge(plan: IncomingConceptMergePlan, session: ConceptConflictMergeSession, revision: number): Promise<void> {
		try {
			const result = await this.actions.mergeService.execute(plan);
			if (result.status !== "merged") {
				if (!this.isCurrentSession(session, revision)) return;
				this.statusMessage = result.message;
				new Notice(`Mneme: ${result.message}`);
				return;
			}
			this.completed = true;
			let refreshFailed = false;
			try {
				await this.actions.onMerged(session);
			} catch (error) {
				refreshFailed = true;
				console.error("Mneme: conflict Merge completed but dependent views could not refresh", error);
			}
			if (!this.isCurrentSession(session, revision)) return;
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
			if (!this.isCurrentSession(session, revision)) return;
			console.error("Mneme: conflict Merge failed", error);
			this.statusMessage = formatUserFacingError(error, "Your incoming Concept remains saved.");
			new Notice(`Mneme: ${this.statusMessage}`);
		}
	}

	private async returnToConflictOptions(): Promise<void> {
		const session = this.session;
		const revision = this.sessionRevision;
		if (!session || this.isWorking || this.isClosed || this.completed) return;
		this.isWorking = true;
		this.render();
		try {
			await this.flushDraft();
			if (!this.isCurrentSession(session, revision)) return;
			this.returnHandled = true;
			this.leaf.detach();
			await session.onReturn();
		} catch (error) {
			if (!this.isCurrentSession(session, revision)) return;
			this.statusMessage = formatUserFacingError(error, "Could not save the Merge draft. Try returning again.");
			new Notice(`Mneme: ${this.statusMessage}`);
		} finally {
			if (this.isCurrentSession(session, revision)) {
				this.isWorking = false;
				this.render();
			}
		}
	}

	private scheduleDraftSave(): void {
		const session = this.session;
		const revision = this.sessionRevision;
		if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = undefined;
			if (!session || !this.isCurrentSession(session, revision) || this.isWorking || this.completed) return;
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
		if (!session || !draft || this.completed) return this.saveQueue;
		const record: ConceptConflictMergeDraftRecord = {
			draft: cloneDraft(draft),
			existingConceptId: session.existing.conceptId,
			incomingFingerprint: session.incomingFingerprint,
			key: session.key,
			updatedAt: new Date().toISOString(),
		};
		this.saveQueue = this.saveQueue
			.catch(() => undefined)
			.then(() => this.completed ? undefined : this.actions.draftStore.saveDraft(record));
		return this.saveQueue;
	}
}

function cloneDraft(draft: ConceptMergeDraft): ConceptMergeDraft {
	return {
		...draft,
		tags: [...draft.tags],
	};
}
