import type { ConceptSummary } from "../models/conceptLibrary";
import { normalizeVaultPath } from "../utils/markdownPath";
import { createRelatedConceptMatcher, type RelatedConceptResolver } from "./relatedConceptResolution";
import {
	addRelatedConceptLink,
	removeRelatedConceptLink,
} from "./conceptRelatedLinks";
import {
	executeMarkdownWriteTransaction,
	MarkdownWriteConflict,
	type TransactionalMarkdownVault,
} from "./markdownWriteTransaction";

export type RelatedConceptVaultAdapter = TransactionalMarkdownVault & RelatedConceptResolver;

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
				try {
					this.assertPlannedResolution(plan, write);
				} catch {
					return { message: `Related link resolution changed in ${write.path}. Prepare the relationship again.`, status: "conflict" };
				}
			}

			// A later awaited read may change an earlier side's resolution. Check
			// all sides together even when the transaction has no changed files.
			for (const write of plan.writes) this.assertPlannedResolution(plan, write);
			const forwardPaths = new Set(plan.writes.map((write) => write.path));
			await executeMarkdownWriteTransaction({
				read: (path) => this.vault.read(path),
				process: (path, transform) => {
					// Recheck both sides at each forward transform, including no-op
					// decisions. Compensation restores bytes, not current resolutions.
					const forward = forwardPaths.delete(path);
					return this.vault.process(path, (current) => {
						if (forward) for (const write of plan.writes) this.assertPlannedResolution(plan, write);
						return transform(current);
					});
				},
			}, plan.writes);

			return { status: plan.action === "add" ? "linked" : "unlinked" };
		} catch (error) {
			return {
				message: formatError(error),
				status: error instanceof MarkdownWriteConflict ? "conflict" : "failed",
			};
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

			const firstAfter = this.updateMarkdown(action, firstBefore, first.path, second);
			const secondAfter = this.updateMarkdown(action, secondBefore, second.path, first);

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

	private updateMarkdown(action: RelatedConceptPlan["action"], markdown: string, sourcePath: string, target: ConceptSummary): string {
		const matches = createRelatedConceptMatcher(this.vault, sourcePath);
		const emittedPath = normalizeVaultPath(target.path).replace(/\.md$/i, "");
		if (action === "add" && !emittedPath.includes("/") && !matches(emittedPath, target.path)) {
			throw new Error(`The Related link [[${emittedPath}]] in ${sourcePath} resolves to another file. Rename or move the target to give it an unambiguous path.`);
		}
		return action === "add"
			? addRelatedConceptLink(markdown, target, matches).markdown
			: removeRelatedConceptLink(markdown, target.path, matches).markdown;
	}

	private assertPlannedResolution(plan: RelatedConceptPlan, write: RelatedConceptWrite): void {
		try {
			const target = write.path === plan.first.path ? plan.second : plan.first;
			if (this.updateMarkdown(plan.action, write.before, write.path, target) !== write.after) throw new Error("Changed resolution");
		} catch {
			throw new MarkdownWriteConflict(write.path);
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
