import { assertCardDeletionAllowsPath, readCardDeletion } from "./cardDeletionReceipt";
import { assertConceptNotDeleting } from "./conceptDeletionReceipt";
import type { ConceptSummary } from "../models/conceptLibrary";
import { createEmptyManualCardDraft, type ManualCardDraft } from "../models/manualCardDraft";
import type { ManualCardWriteReceipt } from "../models/manualCardWrite";
import type { MnemeSettings } from "../models/settings";
import { readApprovedWriteReceipt, writtenContentHash } from "./approvedWriteRecovery";
import { createRandomCardId } from "./entityId";
import { applyManualCard, prepareManualCard, renderManualCard, type ManualCardResult, type ManualCardVault } from "./manualCardService";
import { isDraftId, manualCardDraftHash, readCurrentManualCardDraft, readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface ManualCardCreationResult extends ManualCardResult {
	nextDraft: ManualCardDraft;
}

/** Hold the shared storage queue across intent, Markdown, and completion; never nest store mutations. */
export function createManualCardWithRecovery(
	draft: ManualCardDraft,
	concept: ConceptSummary | undefined,
	settings: MnemeSettings,
	vault: ManualCardVault,
	storage: PluginDataStorage,
	historicalCardIds: ReadonlySet<string> = new Set(),
	createId: () => string = createRandomCardId,
): Promise<ManualCardCreationResult> {
	return runPluginDataMutation(storage, async () => {
		const data = normalizePluginData(await storage.loadData());
		let receipt = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		if (!isDraftId(draft.draftId)) throw new Error("Reopen Card Composer before creating a Card.");
		const inputHash = await manualCardDraftHash(draft);
		const currentDraft = readCurrentManualCardDraft(data);
		if (receipt?.draftId === draft.draftId) {
			if (receipt.inputHash !== inputHash) throw new Error("The pending Card draft has changed. Existing Markdown was preserved.");
			if (receipt.status === "written") return resultFor(receipt, currentDraft);
		} else if (receipt?.status === "pending") {
			throw new Error("Resume the pending Card creation before creating another Card.");
		}
		assertConceptNotDeleting(data.conceptDeletions, draft.conceptId ?? "");
		const cardDeletion = readCardDeletion(data.cardDeletion);
		if (receipt?.status === "pending") assertCardDeletionAllowsPath(data.cardDeletion, receipt.cardsPath);
		if (draft.draftId !== currentDraft.draftId || inputHash !== await manualCardDraftHash(currentDraft)) {
			throw new Error("This Composer draft is out of date. Reopen Card Composer before creating a Card.");
		}

		if (receipt?.draftId !== draft.draftId) {
			if (!concept || concept.conceptId !== draft.conceptId) throw new Error("Select an approved Concept first.");
			const reservedIds = new Set([...historicalCardIds, ...Object.keys(data.cardTombstones)]);
			if (cardDeletion) reservedIds.add(cardDeletion.cardId);
			if (receipt) reservedIds.add(receipt.cardId);
			for (const proposal of Object.values(data.knowledgeProposals)) {
				if (proposal.writeReceipt === undefined) continue;
				const write = readApprovedWriteReceipt(proposal.writeReceipt);
				if (write.entityId) reservedIds.add(write.entityId);
			}
			const prepared = await prepareManualCard({ ...draft, concept }, settings, vault, reservedIds, createId);
			assertCardDeletionAllowsPath(data.cardDeletion, prepared.cardsPath);
			const afterHash = await writtenContentHash("upsert_card_group", prepared.markdown, prepared.cardId);
			if (!afterHash) throw new Error("The Card could not be rendered with a valid identity.");
			receipt = {
				version: 1, draftId: draft.draftId, inputHash, conceptId: concept.conceptId,
				conceptTitle: concept.title, conceptPath: concept.path,
				cardId: prepared.cardId, cardsPath: prepared.cardsPath, targetExisted: prepared.targetExisted,
				afterHash, createdAt: new Date().toISOString(), status: "pending",
			};
			readManualCardWriteReceipt(receipt);
			data.manualCardWrite = receipt;
			await storage.saveData(data);
		}

		const existing = await vault.exists(receipt.cardsPath) ? await vault.read(receipt.cardsPath) : undefined;
		const currentHash = existing === undefined ? undefined : await writtenContentHash("upsert_card_group", existing, receipt.cardId);
		if (currentHash !== receipt.afterHash) {
			if (currentHash !== undefined) throw new Error("The saved Card was edited. Check Cards Markdown before resuming creation.");
			if (historicalCardIds.has(receipt.cardId)) throw new Error("The saved Card ID is in use or was moved. Restore its Card Group before resuming creation.");
			const markdown = renderManualCard({ ...draft, concept: {
				conceptId: receipt.conceptId, title: receipt.conceptTitle, path: receipt.conceptPath,
			} }, receipt.cardId);
			if (await writtenContentHash("upsert_card_group", markdown, receipt.cardId) !== receipt.afterHash) {
				throw new Error("The saved Card rendering has changed. Existing Markdown was preserved.");
			}
			await applyManualCard({ ...receipt, markdown }, vault);
		}

		const nextDraft = createEmptyManualCardDraft(receipt.conceptId);
		const nextData = { ...data, manualCardDraftId: nextDraft.draftId, manualCardWrite: { ...receipt, status: "written" as const } };
		delete nextData.manualCardDraft;
		await storage.saveData(nextData);
		return resultFor(receipt, nextDraft);
	});
}

function resultFor(receipt: ManualCardWriteReceipt, nextDraft: ManualCardDraft): ManualCardCreationResult {
	return { cardId: receipt.cardId, cardsPath: receipt.cardsPath, conceptId: receipt.conceptId, nextDraft };
}
