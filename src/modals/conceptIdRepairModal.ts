import { assertConceptIdRepairOwnership, type ConceptIdentityReference } from "../services/conceptIdRepairOwnership";
import { App, Modal, Notice, TFile, parseYaml } from "obsidian";
import type { ConceptIdentityIssue } from "../models/conceptLibrary";
import {
	assignCardGroupConceptId,
	assignConceptId,
	createStableConceptId,
	getCardGroupConceptId,
} from "../services/conceptIdEditor";

export interface ConceptIdRepairModalOptions {
	existingConceptIds: Set<string>;
	issue: ConceptIdentityIssue;
	onSaved(oldReviewConceptId: string | undefined, newConceptId: string, migrateState: boolean): Promise<void> | void;
}

export class ConceptIdRepairModal extends Modal {
	private isSaving = false;

	constructor(app: App, private readonly options: ConceptIdRepairModalOptions) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.isDuplicateRepair() ? "Replace Duplicate Concept ID" : "Assign Stable Concept ID");
		this.renderContent();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderContent(): void {
		const { issue } = this.options;
		this.contentEl.empty();
		this.contentEl.createEl("p", { text: `${issue.title} · ${issue.path}` });
		this.contentEl.createEl("p", {
			cls: "mneme-review-status",
			text: this.isDuplicateRepair()
				? "This Concept and its explicitly linked Card Group receive a new identity. Shared state stays with the original ID."
				: "The linked Card Group is kept in sync. An unambiguous Concept pause is migrated when needed.",
		});
		const labelEl = this.contentEl.createEl("label", { cls: "mneme-proposal-detail-field" });
		labelEl.createEl("span", { text: "New Concept ID" });
		const input = labelEl.createEl("input", {
			attr: { spellcheck: "false", type: "text" },
			cls: "mneme-proposal-detail-field-input",
		});
		input.value = this.getSuggestedId();
		const actionsEl = this.contentEl.createDiv({ cls: "mneme-proposal-detail-modal-actions" });
		const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
		const saveButton = actionsEl.createEl("button", {
			text: this.isDuplicateRepair() ? "Replace ID" : "Assign ID",
		});

		cancelButton.addEventListener("click", () => this.close());
		saveButton.addEventListener("click", () => void this.save(input.value, saveButton));
	}

	private async save(newConceptIdValue: string, saveButton: HTMLButtonElement): Promise<void> {
		if (this.isSaving) {
			return;
		}

		this.isSaving = true;
		saveButton.disabled = true;
		const newConceptId = newConceptIdValue.trim();

		try {
			if (this.options.existingConceptIds.has(newConceptId)) {
				new Notice("Mneme: That Concept ID already exists in the vault.");
				return;
			}

			const { issue } = this.options;
			const conceptFile = this.app.vault.getAbstractFileByPath(issue.path);
			if (!(conceptFile instanceof TFile)) {
				new Notice("Mneme: Concept.md was not found.");
				return;
			}

			const conceptBefore = await this.app.vault.read(conceptFile);
			const conceptResult = assignConceptId(conceptBefore, {
				expectedConceptId: issue.conceptId,
				newConceptId,
			});
			if (conceptResult.status !== "updated") {
				new Notice(`Mneme: ${conceptResult.message}`);
				return;
			}

			const cardFile = issue.cardsPath
				? this.app.vault.getAbstractFileByPath(issue.cardsPath)
				: undefined;
			const cardBefore = cardFile instanceof TFile
				? await this.app.vault.read(cardFile)
				: undefined;
			const references: ConceptIdentityReference[] = [];
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (file.path === issue.path) continue;
				references.push({ path: file.path, frontmatter: readFrontmatter(await this.app.vault.read(file)) });
			}
			assertConceptIdRepairOwnership(issue, newConceptId, readFrontmatter(conceptBefore),
				cardBefore === undefined ? undefined : readFrontmatter(cardBefore), references);
			const cardConceptId = cardBefore === undefined
				? undefined
				: getCardGroupConceptId(cardBefore);
			const cardResult = cardBefore === undefined
				? undefined
				: assignCardGroupConceptId(cardBefore, {
					expectedConceptId: cardConceptId,
					newConceptId,
				});
			if (cardResult && cardResult.status !== "updated") {
				new Notice(`Mneme: Linked Card Group was not changed. ${cardResult.message}`);
				return;
			}

			await this.app.vault.modify(conceptFile, conceptResult.markdown);
			try {
				if (cardFile instanceof TFile && cardResult?.status === "updated") {
					await this.app.vault.modify(cardFile, cardResult.markdown);
				}
				const migrateState = !this.isDuplicateRepair()
					&& !!cardConceptId
					&& cardConceptId !== newConceptId
					&& !this.options.existingConceptIds.has(cardConceptId);
				await this.options.onSaved(cardConceptId, newConceptId, migrateState);
			} catch (error) {
				await this.app.vault.modify(conceptFile, conceptBefore);
				if (cardFile instanceof TFile && cardBefore !== undefined) {
					await this.app.vault.modify(cardFile, cardBefore);
				}
				throw error;
			}

			new Notice("Mneme: Stable Concept ID saved.");
			this.close();
		} catch (error) {
			console.error("Mneme: failed to repair Concept ID", { error, path: this.options.issue.path });
			new Notice(`Mneme: ${error instanceof Error ? error.message : "Concept ID could not be repaired. See console."}`);
		} finally {
			this.isSaving = false;
			saveButton.disabled = false;
		}
	}

	private getSuggestedId(): string {
		if (!this.isDuplicateRepair() && this.options.issue.cardsPath) {
			const cardConceptId = getCachedConceptId(this.app, this.options.issue.cardsPath);
			if (cardConceptId && !this.options.existingConceptIds.has(cardConceptId)) {
				return cardConceptId;
			}
		}

		return createStableConceptId();
	}

	private isDuplicateRepair(): boolean {
		return this.options.issue.kind === "duplicate_id";
	}
}

function getCachedConceptId(app: App, path: string): string | undefined {
	const value = app.metadataCache.getCache(path)?.frontmatter?.mneme_concept_id;

	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFrontmatter(markdown: string): unknown {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	return match ? parseYaml(match[1] ?? "") : undefined;
}
