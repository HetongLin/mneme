import type { ConceptSummary } from "../models/conceptLibrary";
import type { ConceptSourceLink } from "../models/conceptSource";
import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import type { ConceptSourceLinkStore } from "./conceptSourceLinkStore";
import type { ConceptSummaryScanner } from "./preAiAcceptanceFixtureService";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";

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
		const sourceResult = await this.reconcileSourceAnalysisRecords(proposalResult.activeProposalIds);
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
		activeProposalIds: Set<string>;
		removedProposalIds: string[];
	}> {
		const proposals = await this.options.knowledgeProposalStore.loadProposals();
		const activeProposals: Record<string, KnowledgeProposal> = {};
		const removedProposalIds: string[] = [];

		for (const [id, proposal] of Object.entries(proposals)) {
			if (await this.shouldKeepProposal(proposal)) {
				activeProposals[id] = proposal;
			} else {
				removedProposalIds.push(id);
			}
		}

		if (removedProposalIds.length > 0) {
			await this.options.knowledgeProposalStore.replaceProposals(activeProposals);
		}

		return {
			activeProposalIds: new Set(Object.keys(activeProposals)),
			removedProposalIds,
		};
	}

	private async shouldKeepProposal(proposal: KnowledgeProposal): Promise<boolean> {
		if (!isActionableProposalStatus(proposal.status)) {
			return false;
		}

		if (!proposal.sourcePath) {
			return true;
		}

		return this.options.vault.exists(proposal.sourcePath);
	}

	private async reconcileSourceAnalysisRecords(
		activeProposalIds: Set<string>,
	): Promise<{ removedSourcePaths: string[] }> {
		const records = await this.options.sourceAnalysisStore.loadRecords();
		const activeRecords = { ...records };
		const removedSourcePaths: string[] = [];
		let pendingProposalIdsChanged = false;

		for (const [sourcePath, record] of Object.entries(records)) {
			if (await this.options.vault.exists(record.sourcePath)) {
				const pendingProposalIds = record.pendingProposalIds.filter((proposalId) => (
					activeProposalIds.has(proposalId)
				));

				if (pendingProposalIds.length !== record.pendingProposalIds.length) {
					activeRecords[sourcePath] = { ...record, pendingProposalIds };
					pendingProposalIdsChanged = true;
				}
				continue;
			}

			delete activeRecords[sourcePath];
			removedSourcePaths.push(sourcePath);
		}

		if (removedSourcePaths.length > 0 || pendingProposalIdsChanged) {
			await this.options.sourceAnalysisStore.replaceRecords(activeRecords);
		}

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
		const activeLinks: Record<string, ConceptSourceLink> = {};
		const removedConceptSourceLinkIds: string[] = [];
		const staleConceptSourceLinkIds: string[] = [];
		const missingConceptIds = new Set<string>();

		for (const [id, link] of Object.entries(links)) {
			const sourceExists = await this.options.vault.exists(link.sourcePath);
			const conceptExists = !knownConceptIds || knownConceptIds.has(link.conceptId);

			if (conceptExists && (sourceExists || link.status === "stale")) {
				activeLinks[id] = link;
				continue;
			}

			if (conceptExists && link.status === "approved") {
				activeLinks[id] = { ...link, status: "stale" };
				staleConceptSourceLinkIds.push(id);
				continue;
			}

			removedConceptSourceLinkIds.push(id);

			if (!conceptExists) {
				missingConceptIds.add(link.conceptId);
			}
		}

		if (removedConceptSourceLinkIds.length > 0 || staleConceptSourceLinkIds.length > 0) {
			await this.options.conceptSourceLinkStore.replaceLinks(activeLinks);
		}

		return {
			missingConceptIds: [...missingConceptIds],
			removedConceptSourceLinkIds,
			staleConceptSourceLinkIds,
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
		|| status === "stale";
}
