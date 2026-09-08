import { assertCardDeletionAllowsPath } from "./cardDeletionReceipt";
import type { MnemePluginData } from "../models/reviewState";
import { computeContentHash } from "../utils/sourceHash";
import type { ConceptDeletionPlan } from "./conceptDeletionService";
import { readConceptDeletions, type PendingConceptDeletionReceipt } from "./conceptDeletionReceipt";
import { withDeletedConceptState } from "./conceptDeletionState";
import { removeRelatedConceptLink } from "./conceptRelatedLinks";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

export interface RecoverableConceptDeletionVault {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	process(path: string, transform: (current: string) => string): Promise<void>;
	rename(path: string, destination: string): Promise<void>;
	trash(path: string): Promise<void>;
}

// JSON encoding preserves newline differences, unlike hashes used for source analysis.
export const deletionContentHash = (content: string): Promise<string> => computeContentHash(JSON.stringify(content));

/** Intent, file transitions and completion share the plugin data queue. No nested stores. */
export class RecoverableConceptDeletion {
	constructor(
		private readonly vault: RecoverableConceptDeletionVault,
		private readonly storage: PluginDataStorage,
		private readonly operationId: () => string = () => globalThis.crypto.randomUUID(),
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	delete(plan: ConceptDeletionPlan): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const receipts = readConceptDeletions(data.conceptDeletions);
			if (receipts[plan.concept.conceptId] || Object.values(receipts).some((r) => r.status === "pending")) {
				throw new Error("This Concept ID was deleted or a deletion is pending. Run Resume Concept Deletion.");
			}
			this.assertNoPendingWrites(data, plan);
			const operationId = this.operationId();
			const files = [ ...(plan.cardsFile ? [plan.cardsFile] : []), plan.conceptFile ];
			const receipt: PendingConceptDeletionReceipt = {
				version: 1, status: "pending", operationId, conceptId: plan.concept.conceptId,
				createdAt: this.now(), conceptPath: plan.conceptFile.path, cardIds: plan.cardIds,
				files: await Promise.all(files.map(async (file) => ({
					path: file.path, stagePath: `${file.path}.mneme-delete-${operationId}`,
					hash: await deletionContentHash(file.content), phase: "planned" as const,
				}))),
				related: await Promise.all(plan.relatedWrites.map(async (write) => ({
					path: write.path, beforeHash: await deletionContentHash(write.before),
					afterHash: await deletionContentHash(write.after),
				}))),
			};
			data.conceptDeletions = readConceptDeletions({ ...receipts, [receipt.conceptId]: receipt });
			for (const file of files) {
				if (await this.vault.read(file.path) !== file.content) throw this.conflict(file.path);
			}
			for (const file of receipt.files) {
				if (await this.vault.exists(file.stagePath)) throw this.conflict(file.stagePath);
			}
			for (const write of plan.relatedWrites) {
				if (await this.vault.read(write.path) !== write.before) throw this.conflict(write.path);
			}
			await this.storage.saveData(data);
			await this.finish(data, receipt);
		});
	}

	/** Does not need a scanner or the original Concept to still exist. */
	resume(): Promise<boolean> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const pending = Object.values(readConceptDeletions(data.conceptDeletions))
				.find((receipt): receipt is PendingConceptDeletionReceipt => receipt.status === "pending");
			if (!pending) return false;
			await this.finish(data, pending);
			return true;
		});
	}

	private async finish(data: MnemePluginData, receipt: PendingConceptDeletionReceipt): Promise<void> {
		for (const write of receipt.related) {
			const before = await this.vault.read(write.path);
			const hash = await deletionContentHash(before);
			if (hash === write.afterHash) continue;
			if (hash !== write.beforeHash) throw this.conflict(write.path);
			const after = removeRelatedConceptLink(before, receipt.conceptPath).markdown;
			if (await deletionContentHash(after) !== write.afterHash) throw this.conflict(write.path);
			await this.vault.process(write.path, (current) => {
				if (current !== before) throw this.conflict(write.path);
				return after;
			});
		}
		for (const file of receipt.files) {
			if (file.phase === "planned") {
				if (await this.vault.exists(file.path)) {
					if (await this.vault.exists(file.stagePath)) throw this.conflict(file.stagePath);
					await this.assertHash(file.path, file.hash);
					await this.vault.rename(file.path, file.stagePath);
				}
				// A rename may have taken effect even if its Promise rejected.
				if (!await this.vault.exists(file.stagePath)) throw this.conflict(file.path);
				if (await deletionContentHash(await this.vault.read(file.stagePath)) !== file.hash) {
					if (!await this.vault.exists(file.path)) await this.vault.rename(file.stagePath, file.path);
					throw this.conflict(file.path);
				}
				file.phase = "staged";
				await this.savePending(data, receipt);
			}
			if (await this.vault.exists(file.path)) throw this.conflict(file.path);
			if (file.phase === "staged") {
				if (await this.vault.exists(file.stagePath)) {
					await this.assertHash(file.stagePath, file.hash);
					// Trash preserves bytes even if an external edit races the final check.
					await this.vault.trash(file.stagePath);
				}
				file.phase = "trashed";
				await this.savePending(data, receipt);
			} else if (await this.vault.exists(file.stagePath)) {
				throw this.conflict(file.stagePath);
			}
		}
		// Recreated paths must never be mistaken for files removed by this operation.
		for (const file of receipt.files) {
			if (await this.vault.exists(file.path) || await this.vault.exists(file.stagePath)) throw this.conflict(file.path);
		}
		const completedAt = this.now();
		const next = withDeletedConceptState(data, receipt.conceptId, receipt.cardIds, completedAt);
		next.conceptDeletions = {
			...readConceptDeletions(data.conceptDeletions),
			[receipt.conceptId]: {
				version: 1, status: "deleted", conceptId: receipt.conceptId, operationId: receipt.operationId,
				conceptPath: receipt.conceptPath, createdAt: receipt.createdAt, completedAt,
			},
		};
		await this.storage.saveData(next);
	}

	private async savePending(data: MnemePluginData, receipt: PendingConceptDeletionReceipt): Promise<void> {
		data.conceptDeletions = { ...readConceptDeletions(data.conceptDeletions), [receipt.conceptId]: receipt };
		await this.storage.saveData(data);
	}
	private async assertHash(path: string, hash: string): Promise<void> {
		if (await deletionContentHash(await this.vault.read(path)) !== hash) throw this.conflict(path);
	}
	private conflict(path: string): Error {
		return new Error(`Deletion stopped because a file changed or moved: ${path}. Preserve the file and check the saved deletion record before running Resume Concept Deletion.`);
	}
	private assertNoPendingWrites(data: MnemePluginData, plan: ConceptDeletionPlan): void {
		const paths = new Set([plan.conceptFile.path, plan.concept.cardsPath, ...plan.relatedWrites.map((w) => w.path)]);
		for (const path of paths) if (path) assertCardDeletionAllowsPath(data.cardDeletion, path);
		const card = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		const concept = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
		if ((card?.status === "pending" && (card.conceptId === plan.concept.conceptId || paths.has(card.cardsPath)))
			|| (concept?.status === "pending" && (concept.conceptId === plan.concept.conceptId || paths.has(concept.path)))) {
			throw new Error("Resume pending creation before deleting this Concept.");
		}
		for (const proposal of Object.values(data.knowledgeProposals)) {
			if (proposal.writeReceipt === undefined || proposal.status === "written") continue;
			const write = readApprovedWriteReceipt(proposal.writeReceipt);
			if (paths.has(write.targetPath) || proposal.conceptId === plan.concept.conceptId) {
				throw new Error(`Complete Inbox write ${proposal.id} before deleting this Concept.`);
			}
		}
	}
}
