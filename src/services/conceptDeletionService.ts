import type { ConceptSummary } from "../models/conceptLibrary";
import { parseMnemeCards } from "./cardMarkerParser";
import {
	getCardGroupConceptIdFromFrontmatter,
	getConceptIdFromFrontmatter,
} from "./conceptMarkdownIdentity";
import { removeRelatedConceptLink } from "./conceptRelatedLinks";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";

export interface ConceptDeletionVaultAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
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

}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
