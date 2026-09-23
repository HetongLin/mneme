import type { ConceptIdentityIssue } from "../models/conceptLibrary";
import type { MnemePluginData } from "../models/reviewState";
import { assignConceptId, assignCardGroupConceptId, getCardGroupConceptId } from "./conceptIdEditor";
import { assertConceptIdRepairOwnership, type ConceptIdentityReference } from "./conceptIdRepairOwnership";
import { assertConceptIdRepairAllowsConcept, assertConceptIdRepairPaths, getReservedConceptRepairIds, readConceptIdRepairs, type ConceptIdRepairReceipt } from "./conceptIdRepairReceipt";
import { assertCardIdRepairAllowsPath } from "./cardIdRepairReceipt";
import { assertCardDeletionAllowsPath } from "./cardDeletionReceipt";
import { assertConceptNotDeleting, readConceptDeletions } from "./conceptDeletionReceipt";
import { getConceptIdFromFrontmatter, getCardGroupConceptIdFromFrontmatter } from "./conceptMarkdownIdentity";
import { readApprovedWriteReceipt } from "./approvedWriteRecovery";
import { readManualCardWriteReceipt } from "./manualCardWriteRecovery";
import { readManualConceptWriteReceipt } from "./manualConceptWriteRecovery";
import { withRekeyedConceptPause } from "./conceptIdRepairState";
import { runPluginDataMutation, type PluginDataStorage } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import type { CardIdRepairVault } from "./recoverableCardIdRepair";
import { computeContentHash } from "../utils/sourceHash";
import { assertIncomingMergeAllowsTarget } from "./incomingConceptMergeRecovery";

export type ConceptIdRepairVault = CardIdRepairVault;
const hashMarkdown = (content: string): Promise<string> => computeContentHash(JSON.stringify(content));
type FileReceipt = ConceptIdRepairReceipt["concept"];

/** One intent covers both identities; partial writes resume forward without restoring old content. */
export class RecoverableConceptIdRepair {
	constructor(private readonly vault: ConceptIdRepairVault, private readonly storage: PluginDataStorage,
		private readonly now: () => string = () => new Date().toISOString()) {}

	repair(issue: ConceptIdentityIssue, newConceptId: string): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			assertConceptIdRepairPaths(issue.path, issue.cardsPath);
			if ((issue.kind === "duplicate_id") !== !!issue.conceptId) throw new Error("Refresh Concept Library before repairing its identity.");
			const data = normalizePluginData(await this.storage.loadData());
			const records = readConceptIdRepairs(data.conceptIdRepairs);
			const completed = records[newConceptId];
			if (completed?.status === "completed" && completed.concept.path === issue.path
				&& completed.cards?.path === issue.cardsPath && completed.oldConceptId === issue.conceptId) {
				await this.assertCompletedFiles(completed);
				return;
			}
			if (Object.values(records).some((r) => r.status === "pending")) throw new Error("Run Resume Concept ID Repair before repairing another Concept.");
			if (getReservedConceptRepairIds(records).includes(newConceptId)) throw new Error("That Concept ID is reserved by an earlier repair.");
			const conceptBefore = await this.vault.readFresh(issue.path);
			const cardsBefore = issue.cardsPath ? await this.vault.readFresh(issue.cardsPath) : undefined;
			const references = await this.readReferences(issue.path);
			assertConceptIdRepairOwnership(issue, newConceptId, this.vault.parseFrontmatter(conceptBefore),
				cardsBefore === undefined ? undefined : this.vault.parseFrontmatter(cardsBefore), references);
			if (issue.conceptId && !references.some((r) => getConceptIdFromFrontmatter(r.frontmatter) === issue.conceptId)) {
				throw new Error("This Concept ID is no longer duplicated. Refresh Concept Library.");
			}
			const conceptResult = assignConceptId(conceptBefore, { expectedConceptId: issue.conceptId, newConceptId });
			if (conceptResult.status !== "updated") throw new Error(conceptResult.message);
			const oldReviewConceptId = cardsBefore === undefined ? undefined : getCardGroupConceptId(cardsBefore);
			const cardsResult = cardsBefore === undefined ? undefined : assignCardGroupConceptId(cardsBefore, { expectedConceptId: oldReviewConceptId, newConceptId });
			if (cardsResult && cardsResult.status !== "updated") throw new Error(cardsResult.message);
			const receipt = readConceptIdRepairs({ [newConceptId]: {
				version: 1, status: "pending", oldConceptId: issue.conceptId, oldReviewConceptId, newConceptId,
				concept: { path: issue.path, beforeHash: await hashMarkdown(conceptBefore), afterHash: await hashMarkdown(conceptResult.markdown) },
				...(issue.cardsPath && cardsBefore !== undefined && cardsResult?.status === "updated" ? { cards: {
					path: issue.cardsPath, beforeHash: await hashMarkdown(cardsBefore), afterHash: await hashMarkdown(cardsResult.markdown),
				} } : {}),
				migrateState: !issue.conceptId && !!oldReviewConceptId && oldReviewConceptId !== newConceptId, createdAt: this.now(),
			} })[newConceptId]!;
			for (const id of [receipt.oldConceptId, receipt.oldReviewConceptId]) if (id) assertConceptIdRepairAllowsConcept(records, id);
			this.assertAvailable(data, receipt);
			this.assertGroupIdentities(receipt, references);
			const pending = { ...data, conceptIdRepairs: { ...records, [newConceptId]: receipt } };
			await this.storage.saveData(pending);
			await this.finish(pending, receipt);
		});
	}

	resume(): Promise<boolean> {
		return runPluginDataMutation(this.storage, async () => {
			const data = normalizePluginData(await this.storage.loadData());
			const receipt = Object.values(readConceptIdRepairs(data.conceptIdRepairs)).find((r) => r.status === "pending");
			if (!receipt) return false;
			await this.finish(data, receipt);
			return true;
		});
	}

	private async finish(data: MnemePluginData, receipt: ConceptIdRepairReceipt): Promise<void> {
		this.assertAvailable(data, receipt);
		// Inspect both files before writing either one, including on restart after a partial write.
		const concept = await this.readStage(receipt.concept);
		const cards = receipt.cards ? await this.readStage(receipt.cards) : undefined;
		const currentConcept = this.vault.parseFrontmatter(concept.markdown);
		const currentCards = cards ? this.vault.parseFrontmatter(cards.markdown) : undefined;
		const issue: ConceptIdentityIssue = { kind: receipt.oldConceptId ? "duplicate_id" : "missing_id",
			conceptId: receipt.oldConceptId, path: receipt.concept.path, cardsPath: receipt.cards?.path, title: "" };
		const references = await this.readReferences(receipt.concept.path);
		this.assertGroupIdentities(receipt, references);
		// Verify the original ownership decision against fresh references even when one target already has the new ID.
		assertConceptIdRepairOwnership(issue, receipt.newConceptId,
			{ ...asRecord(currentConcept), mneme_id: receipt.oldConceptId },
			cards ? { ...asRecord(currentCards), mneme_concept_id: receipt.oldReviewConceptId } : undefined,
			references);
		await this.writeStage(receipt.concept, concept, receipt.oldConceptId, receipt.newConceptId, false);
		if (receipt.cards && cards) await this.writeStage(receipt.cards, cards, receipt.oldReviewConceptId, receipt.newConceptId, true);
		await this.assertCompletedFiles(receipt);
		const next = receipt.migrateState ? withRekeyedConceptPause(data, receipt.oldReviewConceptId!, receipt.newConceptId) : data;
		await this.storage.saveData({ ...next, conceptIdRepairs: {
			...readConceptIdRepairs(data.conceptIdRepairs), [receipt.newConceptId]: { ...receipt, status: "completed" },
		} });
	}

	private async readStage(file: FileReceipt): Promise<{ markdown: string; applied: boolean }> {
		const markdown = await this.vault.readFresh(file.path);
		const hash = await hashMarkdown(markdown);
		if (hash !== file.beforeHash && hash !== file.afterHash) throw this.conflict(file.path);
		return { markdown, applied: hash === file.afterHash };
	}

	private async writeStage(file: FileReceipt, stage: { markdown: string; applied: boolean }, oldId: string | undefined, newConceptId: string, cards: boolean): Promise<void> {
		if (stage.applied) return;
		const result = (cards ? assignCardGroupConceptId : assignConceptId)(stage.markdown, { expectedConceptId: oldId, newConceptId });
		if (result.status !== "updated" || await hashMarkdown(result.markdown) !== file.afterHash) throw this.conflict(file.path);
		await this.vault.process(file.path, (current) => {
			if (current !== stage.markdown) throw this.conflict(file.path);
			return result.markdown;
		});
	}

	private async assertCompletedFiles(receipt: ConceptIdRepairReceipt): Promise<void> {
		for (const file of [receipt.concept, ...(receipt.cards ? [receipt.cards] : [])]) {
			if (await hashMarkdown(await this.vault.readFresh(file.path)) !== file.afterHash) throw this.conflict(file.path);
		}
	}

	private async readReferences(excludedPath: string): Promise<ConceptIdentityReference[]> {
		const references: ConceptIdentityReference[] = [];
		for (const file of await this.vault.listMarkdownFiles()) {
			if (file.path !== excludedPath) references.push({ path: file.path, frontmatter: this.vault.parseFrontmatter(await this.vault.readFresh(file.path)) });
		}
		return references;
	}

	private assertGroupIdentities(receipt: ConceptIdRepairReceipt, references: ConceptIdentityReference[]): void {
		for (const reference of references) {
			if (reference.path === receipt.cards?.path) continue;
			const owner = getCardGroupConceptIdFromFrontmatter(reference.frontmatter);
			if (owner === receipt.newConceptId || (!receipt.oldConceptId && owner && owner === receipt.oldReviewConceptId)) {
				throw new Error("Another Card Group uses this Concept identity. Resolve its ownership before repairing the ID.");
			}
		}
	}

	private assertAvailable(data: MnemePluginData, receipt: ConceptIdRepairReceipt): void {
		const paths = [receipt.concept.path, ...(receipt.cards ? [receipt.cards.path] : [])];
		const ids = [receipt.newConceptId, receipt.oldConceptId, receipt.oldReviewConceptId].filter((id): id is string => !!id);
		assertIncomingMergeAllowsTarget(data, paths, ids);
		for (const id of ids) {
			assertConceptNotDeleting(data.conceptDeletions, id);
			if (Object.prototype.hasOwnProperty.call(data.conceptMergeRecords, id)) throw new Error("Merged Concept IDs cannot be repaired or reused.");
		}
		for (const path of paths) {
			assertCardIdRepairAllowsPath(data.cardIdRepairs, path);
			assertCardDeletionAllowsPath(data.cardDeletion, path);
		}
		for (const deletion of Object.values(readConceptDeletions(data.conceptDeletions))) {
			if (deletion.status === "pending" && [...deletion.files, ...deletion.related].some((file) => paths.includes(file.path))) throw new Error("Complete Concept deletion before repairing these files.");
		}
		if (receipt.oldReviewConceptId !== receipt.newConceptId && Object.prototype.hasOwnProperty.call(data.pausedConcepts, receipt.newConceptId)) {
			throw new Error("The new Concept ID already has review state.");
		}
		const adoptsOwner = !receipt.oldConceptId && receipt.oldReviewConceptId === receipt.newConceptId;
		const manualConcept = data.manualConceptWrite === undefined ? undefined : readManualConceptWriteReceipt(data.manualConceptWrite);
		if (manualConcept && ((manualConcept.conceptId === receipt.newConceptId && !(adoptsOwner && manualConcept.status === "written" && manualConcept.path === receipt.concept.path)) || (manualConcept.status === "pending"
			&& (ids.includes(manualConcept.conceptId) || paths.includes(manualConcept.path) || paths.includes(manualConcept.cardsPath))))) throw new Error("Complete Concept creation before repairing this identity.");
		const manualCard = data.manualCardWrite === undefined ? undefined : readManualCardWriteReceipt(data.manualCardWrite);
		if (manualCard?.status === "pending" && (ids.includes(manualCard.conceptId) || paths.includes(manualCard.cardsPath))) throw new Error("Complete Card creation before repairing this identity.");
		for (const proposal of Object.values(data.knowledgeProposals)) {
			if (proposal.writeReceipt === undefined) continue;
			const write = readApprovedWriteReceipt(proposal.writeReceipt);
			const targetId = proposal.kind === "link_existing_concept" ? proposal.payload?.targetConceptId
				: proposal.payload && "conceptId" in proposal.payload ? proposal.payload.conceptId : proposal.conceptId;
			if ((write.mode === "create" && write.entityId === receipt.newConceptId && !(adoptsOwner && proposal.status === "written" && write.targetPath === receipt.concept.path)) || (proposal.status !== "written"
				&& (paths.includes(write.targetPath) || (!!targetId && ids.includes(targetId))))) throw new Error("Complete the overlapping Inbox write before repairing this identity.");
		}
	}
	private conflict(path: string): Error {
		return new Error(`Concept ID repair conflict: ${path}. Existing content was preserved. Inspect the files before running Resume Concept ID Repair.`);
	}
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
