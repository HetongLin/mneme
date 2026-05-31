import {
	ACCEPTANCE_CARD_PROPOSAL_ID,
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_SOURCE_NOTE_TEMPLATE,
	ACCEPTANCE_SOURCE_PATH,
	buildPreAiAcceptanceCardProposal,
	buildPreAiAcceptanceConceptProposal,
} from "../acceptance/preAiAcceptanceFixture";
import type { KnowledgeProposalStore } from "./knowledgeProposalStore";
import type { MnemeVaultAdapter } from "./approvedProposalWriter";
import type { SourceAnalysisStore } from "./sourceAnalysisStore";

export interface PreAiAcceptanceFixtureResult {
	createdSourceNote: boolean;
	message: string;
	proposalIds: string[];
	sourcePath: string;
	upsertedProposals: number;
}

export interface PreAiAcceptanceFixtureServiceOptions {
	now?: () => string;
	proposalStore: KnowledgeProposalStore;
	sourceAnalysisStore?: SourceAnalysisStore;
	vaultAdapter: MnemeVaultAdapter;
}

export class PreAiAcceptanceFixtureService {
	private readonly now: () => string;

	constructor(private readonly options: PreAiAcceptanceFixtureServiceOptions) {
		this.now = options.now ?? (() => new Date().toISOString());
	}

	async createFixture(): Promise<PreAiAcceptanceFixtureResult> {
		const createdSourceNote = await this.ensureSourceNote();
		const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(ACCEPTANCE_SOURCE_PATH);
		const timestamp = this.now();
		const proposalArgs = {
			createdAt: timestamp,
			sourceHash: sourceRecord?.contentHash,
			sourcePath: ACCEPTANCE_SOURCE_PATH,
			updatedAt: timestamp,
		};
		const proposals = [
			buildPreAiAcceptanceConceptProposal(proposalArgs),
			buildPreAiAcceptanceCardProposal(proposalArgs),
		];

		for (const proposal of proposals) {
			await this.options.proposalStore.upsertProposal(proposal);
		}

		return {
			createdSourceNote,
			message: "Pre-AI acceptance fixture created.",
			proposalIds: proposals.map((proposal) => proposal.id),
			sourcePath: ACCEPTANCE_SOURCE_PATH,
			upsertedProposals: proposals.length,
		};
	}

	private async ensureSourceNote(): Promise<boolean> {
		if (await this.options.vaultAdapter.exists(ACCEPTANCE_SOURCE_PATH)) {
			return false;
		}

		await this.ensureParentFolders(ACCEPTANCE_SOURCE_PATH);
		await this.options.vaultAdapter.create(ACCEPTANCE_SOURCE_PATH, ACCEPTANCE_SOURCE_NOTE_TEMPLATE);

		return true;
	}

	private async ensureParentFolders(path: string): Promise<void> {
		const parts = path.split("/").filter((part) => part.length > 0);

		parts.pop();

		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!(await this.options.vaultAdapter.exists(currentPath))) {
				await this.options.vaultAdapter.createFolder(currentPath);
			}
		}
	}
}

export const PRE_AI_ACCEPTANCE_PROPOSAL_IDS = [
	ACCEPTANCE_CONCEPT_PROPOSAL_ID,
	ACCEPTANCE_CARD_PROPOSAL_ID,
] as const;
