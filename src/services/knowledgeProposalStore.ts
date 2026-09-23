import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import type { MnemePluginData } from "../models/reviewState";
import { applyProposalStatus } from "./knowledgeProposalLifecycle";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { getPendingIncomingConceptMerge } from "./incomingConceptMergeRecovery";
import { getPendingGuidedConceptMerge } from "./guidedConceptMergeRecovery";

const PENDING_PROPOSAL_STATUSES = new Set<KnowledgeProposalStatus>([
	"suggested",
	"opened",
	"edited",
	"approved",
	"stale",
]);

export interface KnowledgeProposalStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class KnowledgeProposalStore {
	constructor(private readonly storage: KnowledgeProposalStorage) {
	}

	async loadProposals(): Promise<Record<string, KnowledgeProposal>> {
		const data = await this.loadPluginData();

		return { ...data.knowledgeProposals };
	}

	async getProposal(id: string): Promise<KnowledgeProposal | undefined> {
		const proposals = await this.loadProposals();

		return proposals[id];
	}

	async upsertProposal(proposal: KnowledgeProposal): Promise<void> {
		await this.upsertProposals([proposal]);
	}

	async upsertProposals(proposals: KnowledgeProposal[]): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const incoming = getPendingIncomingConceptMerge(data);
			const guided = getPendingGuidedConceptMerge(data);
			const proposalsById = Object.fromEntries(proposals.map((proposal) => {
				const current = data.knowledgeProposals[proposal.id];
				if (guided && isActionable(proposal) && targetsConcept(proposal, guided.merged.conceptId)
					&& (!current || JSON.stringify(current) !== JSON.stringify(proposal))) {
					throw new Error("The merged Concept is still being retired. Resume Guided Merge before creating or editing proposals for it.");
				}
				if (incoming?.origin.kind === "inbox" && incoming.origin.proposalId === proposal.id
					&& JSON.stringify(current) !== JSON.stringify(proposal)) {
					throw new Error("Resume the pending Incoming Concept Merge before editing its source proposal.");
				}
				if (!current || (!hasWriteReceipt(current) && current.status !== "written")) {
					return [proposal.id, proposal];
				}
				if (JSON.stringify(current) === JSON.stringify(proposal)) return [proposal.id, current];
				throw new Error("This proposal has completed or pending Markdown recovery. Reopen it before editing.");
			}));

			await this.storage.saveData({
				...data,
				knowledgeProposals: {
					...data.knowledgeProposals,
					...proposalsById,
				},
			});
		});
	}

	async replaceProposals(proposals: Record<string, KnowledgeProposal>): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const incoming = getPendingIncomingConceptMerge(data);
			const guided = getPendingGuidedConceptMerge(data);
			if (guided && Object.values(proposals).some((proposal) => isActionable(proposal)
				&& targetsConcept(proposal, guided.merged.conceptId)
				&& JSON.stringify(data.knowledgeProposals[proposal.id]) !== JSON.stringify(proposal))) {
				throw new Error("The merged Concept is still being retired. Resume Guided Merge before replacing proposals.");
			}
			for (const [id, current] of Object.entries(data.knowledgeProposals)) {
				if (guided && isActionable(current) && targetsConcept(current, guided.merged.conceptId)) {
					const replacement = proposals[id];
					if (!replacement || JSON.stringify(replacement) !== JSON.stringify(current)) {
						throw new Error("Resume the pending Guided Merge before replacing its source proposals.");
					}
				}
				if (incoming?.origin.kind === "inbox" && incoming.origin.proposalId === id) {
					const replacement = proposals[id];
					if (!replacement || JSON.stringify(replacement) !== JSON.stringify(current)) {
						throw new Error("Resume the pending Incoming Concept Merge before replacing its source proposal.");
					}
				}
				if (!hasWriteReceipt(current) && current.status !== "written") continue;
				const replacement = proposals[id];
				if (!replacement || JSON.stringify(replacement) !== JSON.stringify(current)) {
					throw new Error("Cannot replace a proposal with completed or pending Markdown recovery.");
				}
			}

			await this.storage.saveData({
				...data,
				knowledgeProposals: { ...proposals },
			});
		});
	}

	async updateProposalStatus(
		id: string,
		status: KnowledgeProposalStatus,
		now: string = new Date().toISOString(),
	): Promise<KnowledgeProposal> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const proposal = data.knowledgeProposals[id];
			if (!proposal) throw new Error(`Knowledge proposal not found: ${id}`);
			const incoming = getPendingIncomingConceptMerge(data);
			const guided = getPendingGuidedConceptMerge(data);
			if (guided && isActionable({ ...proposal, status }) && targetsConcept({ ...proposal, status }, guided.merged.conceptId)
				&& status !== proposal.status) {
				throw new Error("The merged Concept is still being retired. Resume Guided Merge before activating proposals for it.");
			}
			if (incoming?.origin.kind === "inbox" && incoming.origin.proposalId === id && proposal.status !== status) {
				throw new Error("Resume the pending Incoming Concept Merge before changing its source proposal.");
			}
			if (proposal.status === status) return proposal;
			if (hasWriteReceipt(proposal) && status !== "written") {
				throw new Error("A proposal with a pending write receipt can only be completed as written.");
			}
			const updatedProposal = applyProposalStatus(proposal, status, now);
			await this.storage.saveData({
				...data,
				knowledgeProposals: { ...data.knowledgeProposals, [id]: updatedProposal },
			});
			return updatedProposal;
		});
	}

	async listProposals(): Promise<KnowledgeProposal[]> {
		return Object.values(await this.loadProposals());
	}

	async listPending(): Promise<KnowledgeProposal[]> {
		const proposals = await this.listProposals();

		return proposals.filter((proposal) => PENDING_PROPOSAL_STATUSES.has(proposal.status));
	}

	async listActive(): Promise<KnowledgeProposal[]> {
		return this.listPending();
	}

	async listByStatus(status: KnowledgeProposalStatus): Promise<KnowledgeProposal[]> {
		const proposals = await this.listProposals();

		return proposals.filter((proposal) => proposal.status === status);
	}

	async listBySourcePath(sourcePath: string): Promise<KnowledgeProposal[]> {
		const proposals = await this.listProposals();

		return proposals.filter((proposal) => proposal.sourcePath === sourcePath);
	}

	async removeProposalsIfUnchanged(proposals: KnowledgeProposal[]): Promise<string[]> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const incoming = getPendingIncomingConceptMerge(data);
			const guided = getPendingGuidedConceptMerge(data);
			const nextProposals = { ...data.knowledgeProposals };
			const removedIds: string[] = [];
			for (const expected of proposals) {
				const current = nextProposals[expected.id];
				if (!current || JSON.stringify(current) !== JSON.stringify(expected)) continue;
				if (incoming?.origin.kind === "inbox" && incoming.origin.proposalId === expected.id) continue;
				if (guided && isActionable(current) && targetsConcept(current, guided.merged.conceptId)) continue;
				if (hasWriteReceipt(current) || current.status === "approved") continue;
				delete nextProposals[expected.id];
				removedIds.push(expected.id);
			}
			if (removedIds.length === 0) return removedIds;
			await this.storage.saveData({ ...data, knowledgeProposals: nextProposals });
			return removedIds;
		});
	}

	async clearProposals(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			const incoming = getPendingIncomingConceptMerge(data);
			const guided = getPendingGuidedConceptMerge(data);
			if (incoming?.origin.kind === "inbox") {
				throw new Error("Resume the pending Incoming Concept Merge before clearing its source proposal.");
			}
			if (guided) throw new Error("Resume the pending Guided Merge before clearing proposals for its Concepts.");

			await this.storage.saveData({
				...data,
				knowledgeProposals: {},
			});
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}

export function hasWriteReceipt(proposal: KnowledgeProposal): boolean {
	return proposal.writeReceipt !== undefined;
}

function isActionable(proposal: KnowledgeProposal): boolean {
	return PENDING_PROPOSAL_STATUSES.has(proposal.status);
}

function targetsConcept(proposal: KnowledgeProposal, conceptId: string): boolean {
	if (proposal.conceptId === conceptId) return true;
	const payload = proposal.payload;
	if (!payload) return false;
	if ("targetConceptId" in payload && payload.targetConceptId === conceptId) return true;
	if ("conceptId" in payload && payload.conceptId === conceptId) return true;
	if ("sourceConceptId" in payload && payload.sourceConceptId === conceptId) return true;
	return false;
}
