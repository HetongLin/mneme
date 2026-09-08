import type { ConceptSummary } from "../models/conceptLibrary";
import { parseMnemeCards } from "./cardMarkerParser";
import {
	getCardGroupConceptIdFromFrontmatter,
	getConceptIdFromFrontmatter,
} from "./conceptMarkdownIdentity";
import { removeRelatedConceptLink } from "./conceptRelatedLinks";
import { executeMarkdownWriteTransaction, MarkdownWriteConflict } from "./markdownWriteTransaction";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";

export interface ConceptDeletionVaultAdapter {
	create(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	process(path: string, transform: (current: string) => string): Promise<void>;
	read(path: string): Promise<string>;
	remove(path: string): Promise<void>;
}

export interface ConceptDeletionWrite {
	after: string;
	before: string;
	path: string;
}

export interface ConceptDeletionFile {
	content: string;
	path: string;
}

export interface ConceptDeletionPlan {
	cardIds: string[];
	cardsFile?: ConceptDeletionFile;
	concept: ConceptSummary;
	conceptFile: ConceptDeletionFile;
	relatedWrites: ConceptDeletionWrite[];
}

export type PrepareConceptDeletionResult =
	| { message: string; status: "blocked" }
	| { plan: ConceptDeletionPlan; status: "ready" };

export type ExecuteConceptDeletionResult =
	| { cardIds: string[]; status: "deleted" }
	| { message: string; status: "conflict" | "failed" };

export class ConceptDeletionService {
	constructor(private readonly vault: ConceptDeletionVaultAdapter) {
	}

	async prepare(
		concept: ConceptSummary,
		concepts: ConceptSummary[],
	): Promise<PrepareConceptDeletionResult> {
		try {
			if (!await this.vault.exists(concept.path)) {
				return { message: "Concept Markdown was not found.", status: "blocked" };
			}

			const conceptMarkdown = await this.vault.read(concept.path);
			if (getConceptIdFromFrontmatter(parseSimpleFrontmatter(conceptMarkdown)) !== concept.conceptId) {
				return { message: "Concept identity changed. Refresh Concept Library.", status: "blocked" };
			}

			let cardsFile: ConceptDeletionFile | undefined;
			let cardIds: string[] = [];
			if (concept.cardsPath && await this.vault.exists(concept.cardsPath)) {
				const cardsMarkdown = await this.vault.read(concept.cardsPath);
				const cardGroupConceptId = getCardGroupConceptIdFromFrontmatter(parseSimpleFrontmatter(cardsMarkdown));
				if (cardGroupConceptId !== concept.conceptId) {
					return {
						message: "Cards Markdown has a missing or different Concept owner. Delete was stopped.",
						status: "blocked",
					};
				}
				cardsFile = { content: cardsMarkdown, path: concept.cardsPath };
				cardIds = [...new Set(parseMnemeCards(cardsMarkdown)
					.map((card) => card.explicitCardId)
					.filter((cardId): cardId is string => !!cardId))];
			}

			const relatedWrites: ConceptDeletionWrite[] = [];
			for (const other of concepts) {
				if (other.conceptId === concept.conceptId || other.path === concept.path) continue;
				if (!await this.vault.exists(other.path)) continue;
				const before = await this.vault.read(other.path);
				const removed = removeRelatedConceptLink(before, concept.path);
				if (removed.changed) {
					relatedWrites.push({ after: removed.markdown, before, path: other.path });
				}
			}

			return {
				plan: {
					cardIds,
					cardsFile,
					concept,
					conceptFile: { content: conceptMarkdown, path: concept.path },
					relatedWrites,
				},
				status: "ready",
			};
		} catch (error) {
			return { message: formatError(error), status: "blocked" };
		}
	}

	async execute(
		plan: ConceptDeletionPlan,
		onFilesDeleted?: (cardIds: string[]) => Promise<void> | void,
	): Promise<ExecuteConceptDeletionResult> {
		const deletedFiles: ConceptDeletionFile[] = [];
		const completedWrites: ConceptDeletionWrite[] = [];

		try {
			if (await this.vault.read(plan.conceptFile.path) !== plan.conceptFile.content) {
				return { message: "Concept changed after deletion was prepared.", status: "conflict" };
			}
			if (plan.cardsFile && await this.vault.read(plan.cardsFile.path) !== plan.cardsFile.content) {
				return { message: "Cards changed after deletion was prepared.", status: "conflict" };
			}
			for (const write of plan.relatedWrites) {
				if (await this.vault.read(write.path) !== write.before) {
					return { message: `${write.path} changed after deletion was prepared.`, status: "conflict" };
				}
			}

			for (const write of plan.relatedWrites) {
				await executeMarkdownWriteTransaction(this.vault, [write]);
				completedWrites.push(write);
			}
			if (plan.cardsFile) {
				await this.assertFileUnchanged(plan.cardsFile);
				await this.vault.remove(plan.cardsFile.path);
				deletedFiles.push(plan.cardsFile);
			}
			await this.assertFileUnchanged(plan.conceptFile);
			await this.vault.remove(plan.conceptFile.path);
			deletedFiles.push(plan.conceptFile);
			await onFilesDeleted?.(plan.cardIds);

			return { cardIds: plan.cardIds, status: "deleted" };
		} catch (error) {
			const rollbackErrors: string[] = [];
			for (const file of [...deletedFiles].reverse()) {
				try {
					if (!await this.vault.exists(file.path)) {
						await this.vault.create(file.path, file.content);
					} else if (await this.vault.read(file.path) !== file.content) {
						throw new Error("path is occupied; rollback preserved the existing content");
					}
				} catch (rollbackError) {
					rollbackErrors.push(`${file.path}: ${formatError(rollbackError)}`);
				}
			}
			for (const write of [...completedWrites].reverse()) {
				try {
					await executeMarkdownWriteTransaction(this.vault, [{
						path: write.path, before: write.after, after: write.before,
					}]);
				} catch (rollbackError) {
					rollbackErrors.push(`${write.path}: ${formatError(rollbackError)}`);
				}
			}

			const rollback = rollbackErrors.length > 0
				? ` Rollback also failed: ${rollbackErrors.join("; ")}`
				: "";
			return {
				message: `${formatError(error)}${rollback}`,
				status: error instanceof MarkdownWriteConflict && rollbackErrors.length === 0 ? "conflict" : "failed",
			};
		}
	}

	private async assertFileUnchanged(file: ConceptDeletionFile): Promise<void> {
		if (await this.vault.read(file.path) !== file.content) throw new MarkdownWriteConflict(file.path);
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
