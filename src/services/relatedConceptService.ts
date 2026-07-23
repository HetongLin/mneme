import type { ConceptSummary } from "../models/conceptLibrary";
import {
	addRelatedConceptLink,
	removeRelatedConceptLink,
} from "./conceptRelatedLinks";

export interface RelatedConceptVaultAdapter {
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

export interface RelatedConceptWrite {
	after: string;
	before: string;
	path: string;
}

export interface RelatedConceptPlan {
	action: "add" | "remove";
	first: ConceptSummary;
	second: ConceptSummary;
	writes: RelatedConceptWrite[];
}

export type PrepareRelatedConceptResult =
	| { message: string; status: "blocked" }
	| { plan: RelatedConceptPlan; status: "ready" };

export type ExecuteRelatedConceptResult =
	| { status: "linked" | "unlinked" }
	| { message: string; status: "conflict" | "failed" };

export class RelatedConceptService {
	constructor(private readonly vault: RelatedConceptVaultAdapter) {
	}

	async prepareAdd(first: ConceptSummary, second: ConceptSummary): Promise<PrepareRelatedConceptResult> {
		return this.prepare("add", first, second);
	}

	async prepareRemove(first: ConceptSummary, second: ConceptSummary): Promise<PrepareRelatedConceptResult> {
		return this.prepare("remove", first, second);
	}

	async execute(plan: RelatedConceptPlan): Promise<ExecuteRelatedConceptResult> {
		try {
			for (const write of plan.writes) {
				if (await this.vault.read(write.path) !== write.before) {
					return { message: `${write.path} changed after the relationship was prepared.`, status: "conflict" };
				}
			}

			const written: RelatedConceptWrite[] = [];
			try {
				for (const write of plan.writes) {
					if (write.after === write.before) continue;
					await this.vault.modify(write.path, write.after);
					written.push(write);
				}
			} catch (error) {
				const rollbackErrors: string[] = [];
				for (const write of [...written].reverse()) {
					try {
						if (await this.vault.read(write.path) !== write.after) {
							rollbackErrors.push(`${write.path}: changed after Mneme wrote it; rollback did not overwrite the newer content`);
							continue;
						}
						await this.vault.modify(write.path, write.before);
					} catch (rollbackError) {
						rollbackErrors.push(`${write.path}: ${formatError(rollbackError)}`);
					}
				}
				throw new Error(`${formatError(error)}${rollbackErrors.length ? ` Rollback also failed: ${rollbackErrors.join("; ")}` : ""}`);
			}

			return { status: plan.action === "add" ? "linked" : "unlinked" };
		} catch (error) {
			return { message: formatError(error), status: "failed" };
		}
	}

	private async prepare(
		action: RelatedConceptPlan["action"],
		first: ConceptSummary,
		second: ConceptSummary,
	): Promise<PrepareRelatedConceptResult> {
		if (first.conceptId === second.conceptId || first.path === second.path) {
			return { message: "A Concept cannot be related to itself.", status: "blocked" };
		}

		try {
			const firstBefore = await this.vault.read(first.path);
			const secondBefore = await this.vault.read(second.path);
			if (!hasConceptIdentity(firstBefore, first.conceptId) || !hasConceptIdentity(secondBefore, second.conceptId)) {
				return { message: "Concept identity changed. Refresh Concept Library.", status: "blocked" };
			}

			const firstAfter = action === "add"
				? addRelatedConceptLink(firstBefore, second).markdown
				: removeRelatedConceptLink(firstBefore, second.path).markdown;
			const secondAfter = action === "add"
				? addRelatedConceptLink(secondBefore, first).markdown
				: removeRelatedConceptLink(secondBefore, first.path).markdown;

			return {
				plan: {
					action,
					first,
					second,
					writes: [
						{ after: firstAfter, before: firstBefore, path: first.path },
						{ after: secondAfter, before: secondBefore, path: second.path },
					],
				},
				status: "ready",
			};
		} catch (error) {
			return { message: formatError(error), status: "blocked" };
		}
	}
}

function hasConceptIdentity(markdown: string, conceptId: string): boolean {
	return readFrontmatterScalar(markdown, "mneme_type") === "concept"
		&& readFrontmatterScalar(markdown, "mneme_id") === conceptId;
}

function readFrontmatterScalar(markdown: string, key: string): string | undefined {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1];
	const line = frontmatter?.split(/\r?\n/).find((candidate) => new RegExp(`^${key}\\s*:`).test(candidate));
	return line?.slice(line.indexOf(":") + 1).trim().replace(/^['"]|['"]$/g, "") || undefined;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
