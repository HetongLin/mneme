import type { ConceptStaleSourceIssue } from "../models/conceptLibrary";
import type { ConceptSourceLink, SourceEvidence } from "../models/conceptSource";
import type { MnemePluginData } from "../models/reviewState";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import { normalizeVaultPath } from "../utils/markdownPath";
import { computeContentHash } from "../utils/sourceHash";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import { relinkConceptSourcePath } from "./conceptSourceRelinker";
import { createConceptSourceLinkId } from "./conceptSourceLinking";
import { normalizePluginData } from "./reviewStateStore";

export interface SourceRelinkFileSnapshot {
	content: string;
	mtime: number;
	path: string;
	size: number;
}

export interface SourceProvenanceRelinkVault {
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
	readSnapshot(path: string): Promise<SourceRelinkFileSnapshot>;
}

export interface SourceProvenanceRelinkStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export interface SourceProvenanceRelinkPlan {
	conceptAfter: string;
	conceptBefore: string;
	dataSnapshot: string;
	issue: ConceptStaleSourceIssue;
	linkAfter: ConceptSourceLink;
	newSource: SourceRelinkFileSnapshot;
	nextData: MnemePluginData;
	replacements: number;
}

export type PrepareSourceRelinkResult =
	| { message: string; status: "blocked" }
	| { plan: SourceProvenanceRelinkPlan; status: "ready" };

export type ExecuteSourceRelinkResult =
	| { status: "relinked" }
	| { message: string; status: "conflict" | "failed" };

export class SourceProvenanceRelinkService {
	constructor(
		private readonly vault: SourceProvenanceRelinkVault,
		private readonly storage: SourceProvenanceRelinkStorage,
		private readonly now: () => string = () => new Date().toISOString(),
	) {
	}

	async prepare(
		issue: ConceptStaleSourceIssue,
		newSourcePathValue: string,
	): Promise<PrepareSourceRelinkResult> {
		const newSourcePath = ensureMarkdownPath(newSourcePathValue);
		if (!newSourcePath) {
			return { message: "Choose a Markdown Source Note path.", status: "blocked" };
		}
		if (normalizeComparablePath(newSourcePath) === normalizeComparablePath(issue.link.sourcePath)) {
			return { message: "Choose a different Source Note path.", status: "blocked" };
		}
		if (normalizeComparablePath(newSourcePath) === normalizeComparablePath(issue.conceptPath)) {
			return { message: "A Concept cannot be its own Source Note.", status: "blocked" };
		}

		try {
			const data = normalizePluginData(await this.storage.loadData());
			const currentLink = data.conceptSourceLinks[issue.link.id];
			if (!currentLink
				|| currentLink.status !== "stale"
				|| currentLink.conceptId !== issue.conceptId
				|| currentLink.sourcePath !== issue.link.sourcePath) {
				return { message: "Stale provenance changed. Refresh Concept Library.", status: "blocked" };
			}

			const conceptBefore = await this.vault.read(issue.conceptPath);
			if (!hasConceptIdentity(conceptBefore, issue.conceptId)) {
				return { message: "Concept identity changed. Refresh Concept Library.", status: "blocked" };
			}
			const newSource = await this.vault.readSnapshot(newSourcePath);
			if (normalizeComparablePath(newSource.path) === normalizeComparablePath(issue.conceptPath)) {
				return { message: "A Concept cannot be its own Source Note.", status: "blocked" };
			}
			const sourceHash = await computeContentHash(newSource.content);
			const relinked = relinkConceptSourcePath(conceptBefore, currentLink.sourcePath, newSource.path);
			const conceptAfter = relinked.status === "relinked"
				? relinked.markdown
				: appendConceptSourceNote(conceptBefore, {
					evidence: currentLink.evidence,
					relationType: currentLink.relationType,
					sourceHash,
					sourcePath: newSource.path,
				}).markdown;
			const now = this.now();
			const linkMigration = migrateLink(
				data.conceptSourceLinks,
				currentLink,
				newSource.path,
				sourceHash,
				now,
			);
			const sourceAnalysisRecords = migrateSourceAnalysisRecords(
				data.sourceAnalysisRecords,
				currentLink.sourcePath,
				newSource,
				sourceHash,
				issue.conceptId,
				now,
			);

			return {
				plan: {
					conceptAfter,
					conceptBefore,
					dataSnapshot: JSON.stringify(data),
					issue,
					linkAfter: linkMigration.linkAfter,
					newSource,
					nextData: {
						...data,
						conceptSourceLinks: linkMigration.links,
						sourceAnalysisRecords,
					},
					replacements: relinked.replacements,
				},
				status: "ready",
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Could not prepare Source relink.",
				status: "blocked",
			};
		}
	}

	async execute(plan: SourceProvenanceRelinkPlan): Promise<ExecuteSourceRelinkResult> {
		try {
			if (await this.vault.read(plan.issue.conceptPath) !== plan.conceptBefore) {
				return { message: "Concept.md changed after preview.", status: "conflict" };
			}
			const currentSource = await this.vault.readSnapshot(plan.newSource.path);
			if (currentSource.content !== plan.newSource.content
				|| currentSource.mtime !== plan.newSource.mtime
				|| currentSource.size !== plan.newSource.size) {
				return { message: "The replacement Source Note changed after preview.", status: "conflict" };
			}
			const latestData = normalizePluginData(await this.storage.loadData());
			if (JSON.stringify(latestData) !== plan.dataSnapshot) {
				return { message: "Mneme state changed after preview.", status: "conflict" };
			}

			let markdownWritten = false;
			let dataWriteAttempted = false;
			try {
				if (plan.conceptAfter !== plan.conceptBefore) {
					await this.vault.modify(plan.issue.conceptPath, plan.conceptAfter);
					markdownWritten = true;
				}
				dataWriteAttempted = true;
				await this.storage.saveData(plan.nextData);
			} catch (error) {
				const rollbackErrors: string[] = [];
				if (markdownWritten) {
					try {
						await this.vault.modify(plan.issue.conceptPath, plan.conceptBefore);
					} catch (rollbackError) {
						rollbackErrors.push(`Concept.md: ${formatError(rollbackError)}`);
					}
				}
				if (dataWriteAttempted) {
					try {
						await this.storage.saveData(latestData);
					} catch (rollbackError) {
						rollbackErrors.push(`plugin data: ${formatError(rollbackError)}`);
					}
				}
				throw new Error(`${formatError(error)}${rollbackErrors.length ? ` Rollback also failed: ${rollbackErrors.join("; ")}` : ""}`);
			}

			return { status: "relinked" };
		} catch (error) {
			return { message: formatError(error), status: "failed" };
		}
	}
}

function migrateLink(
	links: Record<string, ConceptSourceLink>,
	staleLink: ConceptSourceLink,
	newSourcePath: string,
	newSourceHash: string,
	now: string,
): { linkAfter: ConceptSourceLink; links: Record<string, ConceptSourceLink> } {
	const nextLinks = { ...links };
	delete nextLinks[staleLink.id];
	const existing = Object.values(nextLinks).find((link) => {
		return link.conceptId === staleLink.conceptId
			&& normalizeComparablePath(link.sourcePath) === normalizeComparablePath(newSourcePath)
			&& link.relationType === staleLink.relationType;
	});
	const proposedId = existing?.id
		?? createConceptSourceLinkId(staleLink.conceptId, newSourcePath, staleLink.relationType);
	const id = existing?.id ?? createUniqueId(proposedId, nextLinks);
	const linkAfter: ConceptSourceLink = {
		...(existing ?? staleLink),
		addedAt: existing && existing.addedAt < staleLink.addedAt ? existing.addedAt : staleLink.addedAt,
		conceptId: staleLink.conceptId,
		evidence: dedupeEvidence([...(existing?.evidence ?? []), ...staleLink.evidence]),
		id,
		lastSeenAt: now,
		relationType: staleLink.relationType,
		sourceHash: newSourceHash,
		sourcePath: newSourcePath,
		status: "approved",
	};
	nextLinks[id] = linkAfter;

	return { linkAfter, links: nextLinks };
}

function migrateSourceAnalysisRecords(
	records: Record<string, SourceAnalysisRecord>,
	oldSourcePath: string,
	newSource: SourceRelinkFileSnapshot,
	contentHash: string,
	conceptId: string,
	now: string,
): Record<string, SourceAnalysisRecord> {
	const next = { ...records };
	const oldRecord = next[oldSourcePath];
	if (oldRecord) {
		next[oldSourcePath] = {
			...oldRecord,
			linkedConceptIds: oldRecord.linkedConceptIds.filter((id) => id !== conceptId),
		};
	}
	const existing = next[newSource.path];
	next[newSource.path] = {
		...(existing ?? {}),
		contentHash,
		lastAnalyzedAt: now,
		linkedConceptIds: [...new Set([...(existing?.linkedConceptIds ?? []), conceptId])],
		mtime: newSource.mtime,
		pendingProposalIds: existing?.pendingProposalIds ?? [],
		size: newSource.size,
		sourcePath: newSource.path,
		status: "clean",
	};
	return next;
}

function dedupeEvidence(evidence: SourceEvidence[]): SourceEvidence[] {
	const seen = new Set<string>();
	return evidence.filter((item) => {
		const key = JSON.stringify(item);
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function createUniqueId(base: string, links: Record<string, ConceptSourceLink>): string {
	if (!links[base]) {
		return base;
	}
	let suffix = 2;
	while (links[`${base}:${suffix}`]) {
		suffix += 1;
	}
	return `${base}:${suffix}`;
}

function ensureMarkdownPath(value: string): string | undefined {
	const normalized = normalizeVaultPath(value);
	if (!normalized) {
		return undefined;
	}
	return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
}

function normalizeComparablePath(value: string): string {
	return normalizeVaultPath(value).replace(/\.md$/i, "").toLocaleLowerCase();
}

function hasConceptIdentity(markdown: string, conceptId: string): boolean {
	const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
	if (!frontmatter) {
		return false;
	}
	const ids = frontmatter
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*mneme_id\s*:\s*(.*?)\s*$/)?.[1])
		.filter((value): value is string => value !== undefined)
		.map((value) => value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2"));
	return ids.length === 1 && ids[0] === conceptId;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
