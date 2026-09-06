import type { KnowledgeProposal, KnowledgeProposalStatus } from "../models/knowledgeProposal";
import type { MnemePluginData } from "../models/reviewState";
import { applyProposalStatus } from "./knowledgeProposalLifecycle";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";

const PENDING_PROPOSAL_STATUSES = new Set<KnowledgeProposalStatus>([
	"suggested",
	"opened",
	"edited",
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
			const proposalsById = Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal]));

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

	async clearProposals(): Promise<void> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

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
