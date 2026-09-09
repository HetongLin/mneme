import type { LoadedMnemeCard } from "../models/card";
import type { MnemePluginData } from "../models/reviewState";
import { computeContentHash } from "../utils/sourceHash";
import { deleteCardBlock } from "./cardDeletionEditor";
import { readCardDeletion, type CardDeletionReceipt } from "./cardDeletionReceipt";
import { assertCardIdRepairAllowsCard, assertCardIdRepairAllowsPath } from "./cardIdRepairReceipt";
import { assertConceptIdRepairAllowsPath } from "./conceptIdRepairReceipt";
import { withDeletedCardState } from "./cardDeletionState";
import { isCardFile } from "./cardFileRecognition";
import { parseMnemeCards } from "./cardMarkerParser";
import { assertCardNotDeleting, assertConceptNotDeleting } from "./conceptDeletionReceipt";
import { getCardGroupConceptIdFromFrontmatter } from "./conceptMarkdownIdentity";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { parseSimpleFrontmatter } from "./simpleFrontmatter";

export interface CardDeletionVault {
	readFresh(path: string): Promise<string>;
	process(path: string, transform: (current: string) => string): Promise<void>;
}

export type CardDeletionInput = Pick<LoadedMnemeCard, "cardId" | "path" | "content" | "front" | "back">;
const hashMarkdown = (content: string): Promise<string> => computeContentHash(JSON.stringify(content));

/** A pending receipt bridges Markdown removal and tombstone persistence. Never roll back uncertain saves. */
export class RecoverableCardDeletion {
	constructor(
		private readonly vault: CardDeletionVault,
		private readonly storage: PluginDataStorage,
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	delete(input: CardDeletionInput): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const pending = readCardDeletion(data.cardDeletion);
			if (Object.prototype.hasOwnProperty.call(data.cardTombstones, input.cardId) && !pending) return;
			if (pending) throw new Error("Run Resume Card Deletion before deleting another Card.");
			assertCardNotDeleting(data.conceptDeletions, input.cardId);
			assertCardIdRepairAllowsCard(data.cardIdRepairs, input.cardId);
			assertCardIdRepairAllowsPath(data.cardIdRepairs, input.path);
			assertConceptIdRepairAllowsPath(data.conceptIdRepairs, input.path);
			const frontmatter = parseSimpleFrontmatter(input.content);
			if (!isCardFile({ name: input.path.split("/").pop() ?? "" }, frontmatter)) {
				throw new Error("The saved Card is not in recognized Card Markdown. Refresh the view.");
			}
			const owner = getCardGroupConceptIdFromFrontmatter(frontmatter);
			if (owner) assertConceptNotDeleting(data.conceptDeletions, owner);
			this.assertNoPendingWrites(data, input.path);
			const result = deleteCardBlock(input.content, {
				cardId: input.cardId, expectedFront: input.front, expectedBack: input.back,
			});
			if (result.status !== "deleted") throw new Error(result.message);
			const receipt = readCardDeletion({
				version: 1, cardId: input.cardId, path: input.path,
				beforeHash: await hashMarkdown(input.content), afterHash: await hashMarkdown(result.markdown),
				createdAt: this.now(),
			})!;
			// The entire loaded snapshot includes owner, Rubric, type and unmarked learner prose.
			if (await this.vault.readFresh(input.path) !== input.content) throw this.conflict(input.path);
			await this.storage.saveData({ ...data, cardDeletion: receipt });
			await this.finish(data, receipt);
		});
	}

	resume(): Promise<boolean> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const receipt = readCardDeletion(data.cardDeletion);
			if (!receipt) return false;
			await this.finish(data, receipt);
			return true;
		});
	}

	private async finish(data: MnemePluginData, receipt: CardDeletionReceipt): Promise<void> {
		assertCardIdRepairAllowsCard(data.cardIdRepairs, receipt.cardId);
		assertCardIdRepairAllowsPath(data.cardIdRepairs, receipt.path);
		assertConceptIdRepairAllowsPath(data.conceptIdRepairs, receipt.path);
		const before = await this.vault.readFresh(receipt.path);
		const hash = await hashMarkdown(before);
		if (hash !== receipt.afterHash) {
			if (hash !== receipt.beforeHash) throw this.conflict(receipt.path);
			const card = parseMnemeCards(before).find((candidate) => candidate.explicitCardId === receipt.cardId);
			if (!card) throw this.conflict(receipt.path);
			const removed = deleteCardBlock(before, {
				cardId: receipt.cardId, expectedFront: card.front, expectedBack: card.back,
			});
			if (removed.status !== "deleted" || await hashMarkdown(removed.markdown) !== receipt.afterHash) {
				throw this.conflict(receipt.path);
			}
			await this.vault.process(receipt.path, (current) => {
				if (current !== before) throw this.conflict(receipt.path);
				return removed.markdown;
			});
		}
		const next = withDeletedCardState(data, receipt.cardId, this.now());
		delete next.cardDeletion;
		await this.storage.saveData(next);
	}

	private conflict(path: string): Error {
		return new Error(`Card Markdown changed: ${path}. Existing content was preserved. Refresh the view, or inspect pending work before running Resume Card Deletion.`);
	}
	private assertNoPendingWrites(data: MnemePluginData, path: string): void {
		const manual = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		if (manual?.status === "pending" && manual.cardsPath === path) {
			throw new Error("Resume Card creation before deleting from this Card Group.");
		}
		for (const proposal of Object.values(data.knowledgeProposals)) {
			if (proposal.status === "written" || proposal.writeReceipt === undefined) continue;
			if (readApprovedWriteReceipt(proposal.writeReceipt).targetPath === path) {
				throw new Error(`Complete Inbox write ${proposal.id} before deleting from this Card Group.`);
			}
		}
	}
}
