import { assertConceptNotDeleting, readConceptDeletions } from "./conceptDeletionReceipt";
import { assertConceptIdRepairAllowsConcept, assertConceptIdRepairAllowsPath, getReservedConceptRepairIds, readConceptIdRepairs } from "./conceptIdRepairReceipt";
import { createEmptyManualConceptDraft, type ManualConceptDraft } from "../models/manualConceptDraft";
import type { ManualConceptWriteReceipt } from "../models/manualConceptWrite";
import type { MnemeSettings } from "../models/settings";
import { computeContentHash } from "../utils/sourceHash";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { prepareManualConcept, renderManualConcept, writePreparedManualConcept, type ManualConceptResult, type ManualConceptVault } from "./manualConceptService";
import { withManualConceptProvenance, type ManualConceptSourceSnapshot } from "./manualConceptProvenanceService";
import { isConceptDraftId, manualConceptDraftHash, readCurrentManualConceptDraft, readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { assertIncomingMergeAllowsOrigin } from "./incomingConceptMergeRecovery";

export interface ManualConceptCreationResult extends ManualConceptResult {
	nextDraft: ManualConceptDraft;
}

export interface ManualConceptWriteOptions {
	createId?: () => string;
	isConceptIdReserved?(conceptId: string): Promise<boolean>;
	readSourceSnapshot?(path: string): Promise<ManualConceptSourceSnapshot>;
}

/** Source provenance, draft completion, and receipt completion share one queued save. */
export function createManualConceptWithRecovery(
	draft: ManualConceptDraft,
	settings: MnemeSettings,
	vault: ManualConceptVault & { read(path: string): Promise<string> },
	storage: PluginDataStorage,
	options: ManualConceptWriteOptions = {},
): Promise<ManualConceptCreationResult> {
	return runPluginDataMutation(storage, async () => {
		let data = normalizePluginData(await storage.loadData());
		assertIncomingMergeAllowsOrigin(data, { kind: "manual" });
		let receipt = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
		if (!isConceptDraftId(draft.draftId)) throw new Error("Reopen Concept Composer before creating a Concept.");
		const inputHash = await manualConceptDraftHash(draft);
		const currentDraft = readCurrentManualConceptDraft(data);
		if (receipt?.draftId === draft.draftId) {
			if (receipt.inputHash !== inputHash) throw new Error("The pending Concept draft has changed. Existing Markdown was preserved.");
			if (receipt.status === "written") return resultFor(receipt, currentDraft);
		} else if (receipt?.status === "pending") {
			throw new Error("Resume the pending Concept creation before creating another Concept.");
		}
		assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt?.path ?? "");
		assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt?.cardsPath ?? "");
		if (draft.draftId !== currentDraft.draftId || inputHash !== await manualConceptDraftHash(currentDraft)) {
			throw new Error("This Composer draft is out of date. Reopen Concept Composer before creating a Concept.");
		}

		if (receipt?.draftId !== draft.draftId) {
			const sourcePath = draft.sourcePath?.trim();
			const source = sourcePath ? await options.readSourceSnapshot?.(sourcePath) : undefined;
			if (sourcePath && (!source || source.path !== sourcePath)) throw new Error("Select an existing Source Note or clear the Source Note field.");
			const reservedIds = new Set([...Object.keys(readConceptDeletions(data.conceptDeletions)), ...Object.keys(data.conceptMergeRecords), ...getReservedConceptRepairIds(data.conceptIdRepairs), ...(receipt ? [receipt.conceptId] : [])]);
			const reservedPaths = new Set(receipt ? [receipt.path] : []);
			for (const repair of Object.values(readConceptIdRepairs(data.conceptIdRepairs))) if (repair.status === "pending") {
				reservedPaths.add(repair.concept.path);
				if (repair.cards) reservedPaths.add(repair.cards.path);
			}
			for (const deletion of Object.values(readConceptDeletions(data.conceptDeletions))) {
				if (deletion.status === "pending") for (const file of deletion.files) reservedPaths.add(file.path);
			}
			for (const proposal of Object.values(data.knowledgeProposals)) {
				if (proposal.writeReceipt === undefined) continue;
				const write = readApprovedWriteReceipt(proposal.writeReceipt);
				if (write.entityId) reservedIds.add(write.entityId);
				reservedPaths.add(write.targetPath);
			}
			const prepared = await prepareManualConcept(draft, settings, vault, options.createId,
				async (id) => reservedIds.has(id) || await options.isConceptIdReserved?.(id) === true, reservedPaths);
			assertConceptIdRepairAllowsPath(data.conceptIdRepairs, prepared.path);
			if (prepared.cardsPath) assertConceptIdRepairAllowsPath(data.conceptIdRepairs, prepared.cardsPath);
			assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, prepared.conceptId);
			receipt = {
				version: 1, draftId: draft.draftId, inputHash, conceptId: prepared.conceptId,
				path: prepared.path, cardsPath: prepared.cardsPath,
				afterHash: await computeContentHash(prepared.markdown), englishAliasesEnabled: settings.suggestEnglishAliases,
				...(source ? { source: { ...source } } : {}), createdAt: new Date().toISOString(), status: "pending",
			};
			readManualConceptWriteReceipt(receipt);
			data.manualConceptWrite = receipt;
			await storage.saveData(data);
		}

		assertConceptNotDeleting(data.conceptDeletions, receipt.conceptId);
		assertConceptIdRepairAllowsConcept(data.conceptIdRepairs, receipt.conceptId);
		assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt.path);
		if (receipt.cardsPath) assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt.cardsPath);
		if ((receipt.source?.path ?? "") !== (draft.sourcePath?.trim() ?? "")) throw new Error("The saved Concept source has changed. Existing Markdown was preserved.");
		if (await vault.exists(receipt.path)) {
			if (await computeContentHash(await vault.read(receipt.path)) !== receipt.afterHash) {
				throw new Error("The saved Concept was edited or its path is occupied. Check Concept Markdown before resuming creation.");
			}
		} else {
			if (await options.isConceptIdReserved?.(receipt.conceptId)) throw new Error("The saved Concept ID is in use or was moved. Restore its path before resuming creation.");
			const markdown = renderManualConcept(draft, receipt.conceptId, receipt.cardsPath, receipt.englishAliasesEnabled);
			if (await computeContentHash(markdown) !== receipt.afterHash) throw new Error("The saved Concept rendering has changed. Existing Markdown was preserved.");
			await writePreparedManualConcept({ ...receipt, markdown }, vault);
		}

		if (receipt.source) data = withManualConceptProvenance(data, receipt, receipt.source, receipt.createdAt);
		const nextDraft = createEmptyManualConceptDraft(receipt.source?.path);
		const nextData = {
			...data, conceptConflictMergeDrafts: { ...data.conceptConflictMergeDrafts },
			manualConceptDraft: nextDraft,
			manualConceptDraftId: nextDraft.draftId, manualConceptWrite: { ...receipt, status: "written" as const },
		};
		delete nextData.conceptConflictMergeDrafts.manual;
		await storage.saveData(nextData);
		return resultFor(receipt, nextDraft);
	});
}

function resultFor(receipt: ManualConceptWriteReceipt, nextDraft: ManualConceptDraft): ManualConceptCreationResult {
	return { conceptId: receipt.conceptId, path: receipt.path, nextDraft };
}
