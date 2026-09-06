import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { ApprovedWriteReceipt } from "../models/markdownWrite";
import { computeContentHash } from "../utils/sourceHash";
import { parseMnemeCards } from "./cardMarkerParser";

export function proposalWriteHash(proposal: KnowledgeProposal): Promise<string> {
	return computeContentHash(JSON.stringify({
		id: proposal.id, kind: proposal.kind, payload: proposal.payload,
		conceptId: proposal.conceptId, cardId: proposal.cardId,
		sourcePath: proposal.sourcePath, sourceHash: proposal.sourceHash, evidence: proposal.evidence,
	}));
}

/** Invalid/unknown receipts must block recovery, never disappear and allow a fresh write. */
export function readApprovedWriteReceipt(value: unknown): ApprovedWriteReceipt {
	if (!value || typeof value !== "object") throw new Error("The saved write recovery record is invalid.");
	const receipt = value as Record<string, unknown>;
	const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
	if (receipt.version !== 1
		|| !hash(receipt.proposalHash) || !hash(receipt.afterHash)
		|| typeof receipt.targetPath !== "string" || !/\.md$/i.test(receipt.targetPath)
		|| /^(?:[\\/]|[a-z]:)/i.test(receipt.targetPath) || /(^|[\\/])\.\.?([\\/]|$)|[\r\n]/.test(receipt.targetPath)
		|| !["create", "modify", "upsert_card_group"].includes(String(receipt.mode))
		|| (receipt.mode === "modify" && !hash(receipt.beforeHash))
		|| (receipt.mode !== "modify" && (typeof receipt.entityId !== "string" || !receipt.entityId.trim() || /[\s<>"']/.test(receipt.entityId)))
		|| typeof receipt.createdAt !== "string" || Number.isNaN(Date.parse(receipt.createdAt))) {
		throw new Error("The saved write recovery record is invalid. Existing Markdown was preserved.");
	}
	return value as ApprovedWriteReceipt;
}

export async function writtenContentHash(
	mode: ApprovedWriteReceipt["mode"],
	markdown: string,
	entityId?: string,
): Promise<string | undefined> {
	if (mode !== "upsert_card_group") return computeContentHash(markdown);
	const matches = parseMnemeCards(markdown).filter((card) => card.explicitCardId === entityId);
	if (matches.length === 0) return undefined;
	const card = matches[0];
	if (matches.length !== 1 || !card?.isValid) throw new Error("Repair the saved Card's markers before retrying completion.");
	const owner = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1]
		?.match(/^mneme_concept_id:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
	return computeContentHash(JSON.stringify({
		owner, cardId: card.explicitCardId, cardType: card.cardType,
		front: card.front, back: card.back, rubric: card.rubric,
	}));
}
