import type { MnemePluginData } from "../models/reviewState";
import type { ConceptMergeWrite } from "./conceptMergeService";
import type { RelatedConceptMergeChecks } from "./conceptMergeRelated";
import { readMarkdownScalar } from "./markdownScalar";
import { parseMnemeCards } from "./cardMarkerParser";
import { normalizeVaultPath } from "../utils/markdownPath";
import { computeContentHash } from "../utils/sourceHash";

/** Recovery snapshots live in a separate, temporary plugin file, never data.json. */
export interface GuidedMergeJournal {
	read(operationId: string): Promise<string>;
	write(operationId: string, contents: string): Promise<void>;
	remove(operationId: string): Promise<void>;
}

export interface GuidedConceptMergeReceipt {
	version: 1;
	operationId: string;
	status: "pending" | "written";
	createdAt: string;
	survivor: { conceptId: string; path: string };
	merged: { conceptId: string; path: string };
	protectedPaths: string[];
	cardIds: string[];
	writes: Array<{ path: string; beforeHash: string; afterHash: string }>;
	journalHash: string;
	sourceLinksHash: string;
}

export interface GuidedMergeJournalRecord {
	version: 1;
	operationId: string;
	writes: ConceptMergeWrite[];
	relatedChecks: RelatedConceptMergeChecks;
	preserveMergedAsView: boolean;
	mergedCardsPath?: string;
	targetCardsPath?: string;
}

export const GUIDED_MERGE_RESUME_MESSAGE = "Run Resume Guided Merge before changing these Concepts or Cards.";
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
const validEntityId = (value: unknown): value is string => typeof value === "string" && !!value && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const validHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validVaultPath = (value: unknown): value is string => typeof value === "string" && !!value
	&& value === normalizeVaultPath(value) && !/^(?:[\\/]|[a-z]:)/i.test(value)
	&& !/(^|[\\/])\.\.?([\\/]|$)|[\x00-\x1f\x7f\\]/.test(value);
const validPath = (value: unknown): value is string => validVaultPath(value) && /\.md$/i.test(value);
const invalid = () => new Error("The Guided Merge recovery record is invalid. Existing files and recovery snapshots were preserved.");

export function readGuidedConceptMergeReceipt(value: unknown): GuidedConceptMergeReceipt {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
	const r = value as GuidedConceptMergeReceipt;
	if (r.version !== 1 || !validId(r.operationId) || !["pending", "written"].includes(r.status)
		|| !validHash(r.journalHash) || !validHash(r.sourceLinksHash)
		|| typeof r.createdAt !== "string" || Number.isNaN(Date.parse(r.createdAt))
		|| !r.survivor || !validEntityId(r.survivor.conceptId) || !validPath(r.survivor.path)
		|| !r.merged || !validEntityId(r.merged.conceptId) || !validPath(r.merged.path)
		|| r.survivor.conceptId === r.merged.conceptId || r.survivor.path === r.merged.path
		|| !Array.isArray(r.cardIds) || !r.cardIds.every(validEntityId)
		|| !Array.isArray(r.protectedPaths) || !r.protectedPaths.every(validPath)
		|| !Array.isArray(r.writes) || r.writes.length < 2
		|| !r.writes.every((w) => w && validPath(w.path) && validHash(w.beforeHash) && validHash(w.afterHash))) throw invalid();
	const paths = r.writes.map((w) => w.path);
	if (new Set(paths).size !== paths.length || !paths.includes(r.survivor.path) || !paths.includes(r.merged.path)
		|| !paths.every((path) => r.protectedPaths.includes(path))) throw invalid();
	return r;
}

export function getPendingGuidedConceptMerge(data: MnemePluginData): GuidedConceptMergeReceipt | undefined {
	const receipt = data.guidedConceptMerge === undefined ? undefined : readGuidedConceptMergeReceipt(data.guidedConceptMerge);
	return receipt?.status === "pending" ? receipt : undefined;
}

export function assertGuidedMergeAllowsTarget(
	data: MnemePluginData,
	paths: Iterable<string>,
	conceptIds: Iterable<string> = [],
	cardIds: Iterable<string> = [],
): void {
	const pending = getPendingGuidedConceptMerge(data);
	if (!pending) return;
	if (Array.from(paths, normalizeVaultPath).some((path) => pending.protectedPaths.includes(path))
		|| Array.from(conceptIds).some((id) => id === pending.survivor.conceptId || id === pending.merged.conceptId)
		|| Array.from(cardIds).some((id) => pending.cardIds.includes(id))) throw new Error(GUIDED_MERGE_RESUME_MESSAGE);
}

export const guidedMergeHash = (value: string): Promise<string> => computeContentHash(JSON.stringify(value));

export function guidedMergeSourceLinksHash(data: MnemePluginData, ids: string[]): Promise<string> {
	return guidedMergeHash(JSON.stringify(Object.values(data.conceptSourceLinks)
		.filter((link) => ids.includes(link.conceptId)).sort((a, b) => a.id.localeCompare(b.id))));
}

export async function readGuidedMergeJournal(contents: string, receipt: GuidedConceptMergeReceipt): Promise<GuidedMergeJournalRecord> {
	if (await guidedMergeHash(contents) !== receipt.journalHash) throw invalid();
	const record = JSON.parse(contents) as GuidedMergeJournalRecord;
	if (!record || record.version !== 1 || record.operationId !== receipt.operationId
		|| typeof record.preserveMergedAsView !== "boolean" || !Array.isArray(record.writes)
		|| record.writes.length !== receipt.writes.length || !record.relatedChecks
		|| typeof record.relatedChecks.scanSignature !== "string" || !Array.isArray(record.relatedChecks.resolutions)
		|| !record.relatedChecks.resolutions.every((r) => r && validPath(r.sourcePath) && typeof r.target === "string"
			&& (r.resolvedPath === undefined || validVaultPath(r.resolvedPath)))
		|| [record.mergedCardsPath, record.targetCardsPath].some((path) => path !== undefined
			&& (!validPath(path) || !receipt.protectedPaths.includes(path)))) throw invalid();
	for (const [index, write] of record.writes.entries()) {
		const expected = receipt.writes[index];
		if (!write || typeof write.before !== "string" || typeof write.after !== "string" || !expected
			|| write.path !== expected.path || await guidedMergeHash(write.before) !== expected.beforeHash
			|| await guidedMergeHash(write.after) !== expected.afterHash) throw invalid();
	}
	// Bind state migration to identities actually present in the reviewed snapshots.
	for (const participant of [receipt.survivor, receipt.merged]) {
		const write = record.writes.find((w) => w.path === participant.path)!;
		if (readMarkdownScalar(write.before, "mneme_type") !== "concept"
			|| readMarkdownScalar(write.before, "mneme_id") !== participant.conceptId) throw invalid();
	}
	const survivor = record.writes.find((w) => w.path === receipt.survivor.path)!;
	const merged = record.writes.find((w) => w.path === receipt.merged.path)!;
	if (readMarkdownScalar(survivor.after, "mneme_type") !== "concept"
		|| readMarkdownScalar(survivor.after, "mneme_id") !== receipt.survivor.conceptId
		|| readMarkdownScalar(merged.after, "mneme_type") !== "concept_redirect"
		|| readMarkdownScalar(merged.after, "former_mneme_id") !== receipt.merged.conceptId
		|| readMarkdownScalar(merged.after, "merged_into") !== receipt.survivor.conceptId
		|| readMarkdownScalar(merged.after, "merged_at") !== receipt.createdAt) throw invalid();
	const cardIds = [...new Set(record.writes.filter((w) => readMarkdownScalar(w.before, "mneme_type") === "card_group")
		.flatMap((w) => parseMnemeCards(w.before).flatMap((card) => card.explicitCardId ? [card.explicitCardId] : [])))].sort();
	if (JSON.stringify(cardIds) !== JSON.stringify([...receipt.cardIds].sort())) throw invalid();
	return record;
}
