import type { ManualConceptSourceSnapshot } from "../models/manualConceptWrite";
import type { MnemePluginData } from "../models/reviewState";
import { normalizeVaultPath } from "../utils/markdownPath";
import { computeContentHash } from "../utils/sourceHash";

/** A completion receipt, never a second copy of approved Markdown or plugin state. */
export interface IncomingConceptMergeReceipt {
	version: 1;
	status: "pending" | "written" | "not-applied";
	operationId: string;
	conceptId: string;
	path: string;
	beforeHash: string;
	afterHash: string;
	createdAt: string;
	origin:
		| { kind: "inbox"; proposalId: string; inputHash: string }
		| { kind: "manual"; inputHash: string; draftId?: string; source?: ManualConceptSourceSnapshot };
}

export const INCOMING_MERGE_RESUME_MESSAGE = "Run Resume Incoming Concept Merge before continuing.";

export function readIncomingConceptMergeReceipt(value: unknown): IncomingConceptMergeReceipt {
	const invalid = () => new Error("The saved Incoming Concept Merge record is invalid. Existing Markdown and drafts were preserved.");
	if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
	const receipt = value as Record<string, unknown>;
	const id = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
	const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
	const path = (value: unknown) => typeof value === "string" && /\.md$/i.test(value)
		&& value === normalizeVaultPath(value) && !/^(?:[\\/]|[a-z]:)/i.test(value)
		&& !/(^|[\\/])\.\.?([\\/]|$)|[\x00-\x1f\\]/.test(value);
	const origin = receipt.origin as Record<string, unknown> | undefined;
	if (receipt.version !== 1 || (receipt.status !== "pending" && receipt.status !== "written" && receipt.status !== "not-applied")
		|| !id(receipt.operationId) || !id(receipt.conceptId) || !path(receipt.path)
		|| !hash(receipt.beforeHash) || !hash(receipt.afterHash)
		|| typeof receipt.createdAt !== "string" || Number.isNaN(Date.parse(receipt.createdAt))
		|| !origin || typeof origin !== "object" || !hash(origin.inputHash)) throw invalid();
	if (origin.kind === "inbox") {
		if (typeof origin.proposalId !== "string" || !origin.proposalId.trim()) throw invalid();
	} else if (origin.kind === "manual") {
		if (origin.draftId !== undefined && !id(origin.draftId)) throw invalid();
		const source = origin.source as Record<string, unknown> | undefined;
		if (source !== undefined && (!source || typeof source !== "object" || !path(source.path)
			|| !hash(source.contentHash) || typeof source.mtime !== "number" || !Number.isFinite(source.mtime) || source.mtime < 0
			|| typeof source.size !== "number" || !Number.isFinite(source.size) || source.size < 0)) throw invalid();
	} else throw invalid();
	return value as IncomingConceptMergeReceipt;
}

export function getPendingIncomingConceptMerge(data: MnemePluginData): IncomingConceptMergeReceipt | undefined {
	const receipt = data.incomingConceptMerge === undefined ? undefined : readIncomingConceptMergeReceipt(data.incomingConceptMerge);
	return receipt?.status === "pending" ? receipt : undefined;
}

export function assertIncomingMergeAllowsOrigin(
	data: MnemePluginData,
	origin: { kind: "manual" } | { kind: "inbox"; proposalId: string },
): void {
	const pending = getPendingIncomingConceptMerge(data);
	if (pending?.origin.kind === origin.kind && (origin.kind === "manual"
		|| (pending.origin.kind === "inbox" && pending.origin.proposalId === origin.proposalId))) {
		throw new Error(INCOMING_MERGE_RESUME_MESSAGE);
	}
}

export function assertIncomingMergeAllowsTarget(
	data: MnemePluginData,
	paths: Iterable<string>,
	conceptIds: Iterable<string> = [],
): void {
	const pending = getPendingIncomingConceptMerge(data);
	if (pending && (Array.from(paths, normalizeVaultPath).includes(pending.path)
		|| Array.from(conceptIds).includes(pending.conceptId))) throw new Error(INCOMING_MERGE_RESUME_MESSAGE);
}

export function incomingMergeOriginHash(
	data: MnemePluginData,
	origin: { kind: "manual" } | { kind: "inbox"; proposalId: string },
): Promise<string> {
	return computeContentHash(JSON.stringify(origin.kind === "inbox"
		? { proposal: data.knowledgeProposals[origin.proposalId] }
		: { draft: data.manualConceptDraft, draftId: data.manualConceptDraftId }));
}

/** JSON escaping prevents source-note newline normalization from weakening this byte-level check. */
export function incomingMergeMarkdownHash(markdown: string): Promise<string> {
	return computeContentHash(JSON.stringify(markdown));
}
