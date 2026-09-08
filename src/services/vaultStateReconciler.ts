import type { ConceptSummary } from "../models/conceptLibrary";
import type { SourceAnalysisRecord } from "../models/sourceAnalysis";
import type { ConceptSourceLink } from "../models/conceptSource";
import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import type { ConceptSourceLinkStore } from "./conceptSourceLinkStore";
import type { ConceptSummaryScanner } from "./preAiAcceptanceFixtureService";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";
import { hasWriteReceipt, type KnowledgeProposalStore } from "./knowledgeProposalStore";

export interface VaultStateFile {
	path: string;
}

export interface VaultStateAdapter {
	exists(path: string): Promise<boolean>;
	listMarkdownFiles(): Promise<VaultStateFile[]>;
}

export interface VaultStateReconciliationResult {
	message: string;
	missingConceptIds: string[];
	removedConceptSourceLinkIds: string[];
	removedProposalIds: string[];
	removedSourcePaths: string[];
	staleConceptSourceLinkIds: string[];
}

export interface VaultStateReconcilerOptions {
	conceptScanner?: ConceptSummaryScanner;
	conceptSourceLinkStore: ConceptSourceLinkStore;
	knowledgeProposalStore: KnowledgeProposalStore;
	sourceAnalysisStore: SourceAnalysisStore;
	vault: VaultStateAdapter;
}

export class VaultStateReconciler {
	constructor(private readonly options: VaultStateReconcilerOptions) {
	}

	async reconcile(): Promise<VaultStateReconciliationResult> {
		const proposalResult = await this.reconcileProposals();
		const sourceResult = await this.reconcileSourceAnalysisRecords();
		const linkResult = await this.reconcileConceptSourceLinks();
		const removedCount = proposalResult.removedProposalIds.length
			+ sourceResult.removedSourcePaths.length
			+ linkResult.removedConceptSourceLinkIds.length;
		const reconciledCount = removedCount + linkResult.staleConceptSourceLinkIds.length;

		return {
			message: reconciledCount > 0
				? `Reconciled ${reconciledCount} stale index items.`
				: "Mneme indexes already match the current vault state.",
			missingConceptIds: linkResult.missingConceptIds,
			removedConceptSourceLinkIds: linkResult.removedConceptSourceLinkIds,
			removedProposalIds: proposalResult.removedProposalIds,
			removedSourcePaths: sourceResult.removedSourcePaths,
			staleConceptSourceLinkIds: linkResult.staleConceptSourceLinkIds,
		};
	}

	private async reconcileProposals(): Promise<{
		removedProposalIds: string[];
	}> {
		const proposals = await this.options.knowledgeProposalStore.loadProposals();
		const removalCandidates: KnowledgeProposal[] = [];

		for (const proposal of Object.values(proposals)) {
			if (!await this.shouldKeepProposal(proposal)) removalCandidates.push(proposal);
		}

		const removedProposalIds = await this.options.knowledgeProposalStore
			.removeProposalsIfUnchanged(removalCandidates);

		return {
			removedProposalIds,
		};
	}

	private async shouldKeepProposal(proposal: KnowledgeProposal): Promise<boolean> {
		if (hasWriteReceipt(proposal) || proposal.status === "approved") return true;
		if (!isActionableProposalStatus(proposal.status)) {
			return false;
		}

		if (!proposal.sourcePath) {
			return true;
		}

		return this.options.vault.exists(proposal.sourcePath);
	}

	private async reconcileSourceAnalysisRecords(): Promise<{ removedSourcePaths: string[] }> {
		const records = await this.options.sourceAnalysisStore.loadRecords();
		const observations: Array<{ record: SourceAnalysisRecord; sourceExists: boolean }> = [];
		for (const record of Object.values(records)) {
			observations.push({ record, sourceExists: await this.options.vault.exists(record.sourcePath) });
		}
		const removedSourcePaths = await this.options.sourceAnalysisStore.reconcileRecordsIfUnchanged(observations);
		return { removedSourcePaths };
	}

	private async reconcileConceptSourceLinks(): Promise<{
		missingConceptIds: string[];
		removedConceptSourceLinkIds: string[];
		staleConceptSourceLinkIds: string[];
	}> {
		const links = await this.options.conceptSourceLinkStore.loadLinks();
		const concepts = await this.scanConceptsSafely();
		const knownConceptIds = concepts ? new Set(concepts.map((concept) => concept.conceptId)) : undefined;
		const changes: Array<{ expected: ConceptSourceLink; action: "remove" | "mark_stale" }> = [];

		for (const link of Object.values(links)) {
			const sourceExists = await this.options.vault.exists(link.sourcePath);
			const conceptExists = !knownConceptIds || knownConceptIds.has(link.conceptId);

			if (conceptExists && (sourceExists || link.status === "stale")) {
				continue;
			}

			if (conceptExists && link.status === "approved") {
				changes.push({ expected: link, action: "mark_stale" });
				continue;
			}

			changes.push({ expected: link, action: "remove" });
		}

		const result = await this.options.conceptSourceLinkStore.reconcileLinksIfUnchanged(changes);
		return {
			missingConceptIds: [...new Set(result.removedLinks
				.filter((link) => knownConceptIds && !knownConceptIds.has(link.conceptId))
				.map((link) => link.conceptId))],
			removedConceptSourceLinkIds: result.removedLinks.map((link) => link.id),
			staleConceptSourceLinkIds: result.staleLinkIds,
		};
	}

	private async scanConceptsSafely(): Promise<ConceptSummary[] | undefined> {
		if (!this.options.conceptScanner) {
			return undefined;
		}

		return this.options.conceptScanner.scanConcepts();
	}
}

function isActionableProposalStatus(status: KnowledgeProposalStatus): boolean {
	return status === "suggested"
		|| status === "opened"
		|| status === "edited"
		|| status === "approved"
		|| status === "stale";
}
