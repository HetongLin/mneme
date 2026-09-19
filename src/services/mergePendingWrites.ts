import type { MnemePluginData } from "../models/reviewState";
import { normalizeVaultPath } from "../utils/markdownPath";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";

/** Preserve the paths, hashes and owners required by unfinished authoring operations. */
export function assertMergeHasNoPendingWrites(
	data: MnemePluginData,
	paths: Iterable<string>,
	// Guided Merge changes Concept/Card ownership; Incoming Merge only edits its target file.
	conceptIds: Iterable<string> = [],
): void {
	const affectedPaths = new Set(Array.from(paths, normalizeVaultPath));
	const affectedIds = new Set(conceptIds);
	const touchesPath = (path: string) => affectedPaths.has(normalizeVaultPath(path));
	const touchesId = (id: string | undefined) => id !== undefined && affectedIds.has(id);
	const card = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
	if (card?.status === "pending" && (touchesPath(card.cardsPath) || touchesId(card.conceptId))) {
		throw new Error("Resume the pending Card creation before merging these files.");
	}
	const concept = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
	if (concept?.status === "pending"
		&& (touchesPath(concept.path) || touchesPath(concept.cardsPath) || touchesId(concept.conceptId))) {
		throw new Error("Resume the pending Concept creation before merging these files.");
	}
	for (const proposal of Object.values(data.knowledgeProposals)) {
		if (proposal.writeReceipt === undefined || proposal.status === "written") continue;
		const receipt = readApprovedWriteReceipt(proposal.writeReceipt);
		const payloadConceptId = proposal.kind === "link_existing_concept" ? proposal.payload?.targetConceptId
			: proposal.payload && "conceptId" in proposal.payload ? proposal.payload.conceptId : undefined;
		if (touchesPath(receipt.targetPath) || touchesId(proposal.conceptId) || touchesId(payloadConceptId)
			|| (receipt.mode === "create" && touchesId(receipt.entityId))) {
			throw new Error(`Complete Inbox write ${proposal.id} before merging these files.`);
		}
	}
}
