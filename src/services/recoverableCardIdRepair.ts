import type { LoadedMnemeCard } from "../models/card";
import type { MnemePluginData } from "../models/reviewState";
import { assignCardId } from "./cardIdEditor";
import { parseMnemeCards } from "./cardMarkerParser";
import { isCardFile } from "./cardFileRecognition";
import { assertCardDeletionAllowsCard, assertCardDeletionAllowsPath } from "./cardDeletionReceipt";
import { assertCardNotDeleting, assertConceptNotDeleting } from "./conceptDeletionReceipt";
import { getCardGroupConceptIdFromFrontmatter } from "./conceptMarkdownIdentity";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { readCardIdRepairs, assertCardIdRepairAllowsCard, getReservedCardRepairIds, type CardIdRepairReceipt } from "./cardIdRepairReceipt";
import { withRekeyedCardState } from "./cardIdRepairState";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { computeContentHash } from "../utils/sourceHash";

export interface CardIdRepairVault {
	parseFrontmatter(markdown: string): unknown;
	readFresh(path: string): Promise<string>;
	process(path: string, transform: (current: string) => string): Promise<void>;
	listMarkdownFiles(): Promise<Array<{ path: string }>>;
}
export type CardIdRepairInput = Pick<LoadedMnemeCard, "cardId" | "path" | "content" | "cardIndex" | "hasExplicitCardId" | "front" | "back">;
const hashMarkdown = (content: string): Promise<string> => computeContentHash(JSON.stringify(content));

/** Persist intent before Markdown. Recovery never compensates with an old file snapshot. */
export class RecoverableCardIdRepair {
	constructor(private readonly vault: CardIdRepairVault, private readonly storage: PluginDataStorage,
		private readonly now: () => string = () => new Date().toISOString()) {}

	repair(input: CardIdRepairInput, newCardId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const records = readCardIdRepairs(data.cardIdRepairs);
			const beforeHash = await hashMarkdown(input.content);
			const completed = Object.values(records).find((r) => r.newCardId === newCardId);
			if (completed?.status === "completed" && completed.oldCardId === input.cardId
				&& completed.path === input.path && completed.cardIndex === input.cardIndex && completed.beforeHash === beforeHash) {
				if (await hashMarkdown(await this.vault.readFresh(completed.path)) !== completed.afterHash) throw this.conflict(completed.path);
				return;
			}
			if (Object.values(records).some((r) => r.status === "pending")) {
				throw new Error("Run Resume Card ID Repair before repairing another Card.");
			}
			assertCardIdRepairAllowsCard(records, input.cardId);
			if (getReservedCardRepairIds(records).includes(newCardId)) throw new Error("That Card ID is reserved by an earlier repair.");
			const result = assignCardId(input.content, {
				cardBlockIndex: input.cardIndex, expectedFront: input.front, expectedBack: input.back,
				expectedCardId: input.hasExplicitCardId ? input.cardId : undefined, newCardId,
			});
			if (result.status !== "updated") throw new Error(result.message);
			const receipt = readCardIdRepairs({ [newCardId]: {
				version: 1, status: "pending", oldCardId: input.cardId, newCardId, path: input.path,
				cardIndex: input.cardIndex, migrateState: !input.hasExplicitCardId,
				beforeHash, afterHash: await hashMarkdown(result.markdown), createdAt: this.now(),
			} })[newCardId]!;
			if (await this.vault.readFresh(input.path) !== input.content) throw this.conflict(input.path);
			const frontmatter = this.vault.parseFrontmatter(input.content);
			if (!isCardFile({ name: input.path.split("/").pop() ?? "" }, frontmatter)) throw new Error("Refresh a recognized Card file before repairing its ID.");
			const owner = getCardGroupConceptIdFromFrontmatter(frontmatter);
			if (owner) assertConceptNotDeleting(data.conceptDeletions, owner);
			this.assertStateAvailable(data, receipt);
			const oldCount = await this.assertFreshIds(receipt, false);
			if (!receipt.migrateState && oldCount < 2) throw new Error("This Card ID is no longer duplicated. Refresh the view.");
			const pendingData = { ...data, cardIdRepairs: { ...records, [newCardId]: receipt } };
			await this.storage.saveData(pendingData);
			await this.finish(pendingData, receipt);
		});
	}

	resume(): Promise<boolean> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const receipt = Object.values(readCardIdRepairs(data.cardIdRepairs)).find((r) => r.status === "pending");
			if (!receipt) return false;
			await this.finish(data, receipt);
			return true;
		});
	}

	private async finish(data: MnemePluginData, receipt: CardIdRepairReceipt): Promise<void> {
		this.assertStateAvailable(data, receipt);
		const before = await this.vault.readFresh(receipt.path);
		const hash = await hashMarkdown(before);
		if (hash !== receipt.beforeHash && hash !== receipt.afterHash) throw this.conflict(receipt.path);
		await this.assertFreshIds(receipt, hash === receipt.afterHash);
		if (hash === receipt.beforeHash) {
			const result = assignCardId(before, { cardBlockIndex: receipt.cardIndex,
				expectedCardId: receipt.migrateState ? undefined : receipt.oldCardId, newCardId: receipt.newCardId });
			if (result.status !== "updated" || await hashMarkdown(result.markdown) !== receipt.afterHash) throw this.conflict(receipt.path);
			await this.vault.process(receipt.path, (current) => {
				if (current !== before) throw this.conflict(receipt.path);
				return result.markdown;
			});
		}
		const next = receipt.migrateState ? withRekeyedCardState(data, receipt.oldCardId, receipt.newCardId) : data;
		await this.storage.saveData({ ...next, cardIdRepairs: {
			...readCardIdRepairs(data.cardIdRepairs), [receipt.newCardId]: { ...receipt, status: "completed" },
		} });
	}

	private assertStateAvailable(data: MnemePluginData, receipt: CardIdRepairReceipt): void {
		assertCardDeletionAllowsPath(data.cardDeletion, receipt.path);
		for (const id of [receipt.oldCardId, receipt.newCardId]) {
			assertCardDeletionAllowsCard(data.cardDeletion, id);
			assertCardNotDeleting(data.conceptDeletions, id);
		}
		// Also checks destination event-only history, even for duplicate-ID repairs that retain old state.
		withRekeyedCardState(data, receipt.oldCardId, receipt.newCardId);
		const manual = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		if (manual && (manual.cardId === receipt.newCardId || (manual.status === "pending" && manual.cardsPath === receipt.path))) {
			throw new Error("Complete Card creation before repairing this identity.");
		}
		for (const proposal of Object.values(data.knowledgeProposals)) {
			if (proposal.writeReceipt === undefined) continue;
			const write = readApprovedWriteReceipt(proposal.writeReceipt);
			if (write.entityId === receipt.newCardId || (proposal.status !== "written" && write.targetPath === receipt.path)) {
				throw new Error("Complete the overlapping Inbox write before repairing this identity.");
			}
		}
	}

	private async assertFreshIds(receipt: CardIdRepairReceipt, alreadyWritten: boolean): Promise<number> {
		let oldCount = 0;
		for (const file of await this.vault.listMarkdownFiles()) {
			const markdown = await this.vault.readFresh(file.path);
			if (!isCardFile({ name: file.path.split("/").pop() ?? "" }, this.vault.parseFrontmatter(markdown))) continue;
			for (const [index, card] of parseMnemeCards(markdown).entries()) {
				const id = card.explicitCardId ?? `${file.path}#${index}`;
				if (id === receipt.oldCardId) oldCount++;
				if (id === receipt.newCardId && !(alreadyWritten && file.path === receipt.path && index === receipt.cardIndex)) {
					throw new Error("That Card ID already exists in the vault. Existing Markdown was preserved.");
				}
			}
		}
		return oldCount;
	}
	private conflict(path: string): Error {
		return new Error(`Card Markdown changed: ${path}. Existing content was preserved. Refresh the view or inspect pending work before running Resume Card ID Repair.`);
	}
}
