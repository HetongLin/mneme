import type { MarkdownWriteDraft, MarkdownWriteResult } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import { ensureUniquePath, normalizeVaultPath } from "../utils/markdownPath";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	mergeLinkedConceptId,
	normalizeConceptIdForWrittenConcept,
} from "./conceptSourceLinking";
import { ConceptSourceLinkStore } from "./conceptSourceLinkStore";
import { KnowledgeProposalStore } from "./knowledgeProposalStore";
import { renderMarkdownProposal } from "./markdownProposalRenderer";
import { SourceAnalysisStore } from "./sourceAnalysisStore";

export interface MnemeVaultAdapter {
	append(path: string, content: string): Promise<void>;
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
}

export interface ApprovedProposalWriterOptions {
	conceptSourceLinkStore?: ConceptSourceLinkStore;
	now?: () => string;
	proposalStore: KnowledgeProposalStore;
	settingsProvider: () => MnemeSettings;
	sourceAnalysisStore?: SourceAnalysisStore;
	vaultAdapter: MnemeVaultAdapter;
}

export class ApprovedProposalWriter {
	private readonly now: () => string;

	constructor(private readonly options: ApprovedProposalWriterOptions) {
		this.now = options.now ?? (() => new Date().toISOString());
	}

	async writeApprovedProposal(proposalId: string): Promise<MarkdownWriteResult> {
		const proposal = await this.options.proposalStore.getProposal(proposalId);

		if (!proposal) {
			return {
				message: `Proposal not found: ${proposalId}`,
				proposalId,
				status: "failed",
				targetPaths: [],
			};
		}

		if (proposal.status !== "approved") {
			return {
				message: "Approve the proposal before writing Markdown.",
				proposalId,
				status: "skipped",
				targetPaths: [],
			};
		}

		const renderResult = renderMarkdownProposal(proposal, this.options.settingsProvider());

		if (renderResult.status !== "rendered") {
			return {
				message: renderResult.message,
				proposalId,
				status: renderResult.status === "unsupported" ? "skipped" : "failed",
				targetPaths: [],
			};
		}

		const targetPaths: string[] = [];

		try {
			const drafts = await this.assignUniqueTargetPaths(renderResult.drafts);

			for (const draft of drafts) {
				await this.ensureParentFolders(draft.targetPath);
				await this.writeDraft(draft);
				targetPaths.push(draft.targetPath);
			}

			await this.indexConceptSourceLinksAfterWrite(proposal, targetPaths);
			await this.options.proposalStore.updateProposalStatus(proposalId, "written", this.now());

			return {
				message: "Markdown written.",
				proposalId,
				status: "written",
				targetPaths,
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Markdown write failed.",
				proposalId,
				status: "failed",
				targetPaths,
			};
		}
	}

	private async assignUniqueTargetPaths(drafts: MarkdownWriteDraft[]): Promise<MarkdownWriteDraft[]> {
		const reservedPaths = new Set<string>();
		const assignedDrafts: MarkdownWriteDraft[] = [];

		for (const draft of drafts) {
			const desiredPath = normalizeVaultPath(draft.targetPath);
			const occupiedPaths = new Set(reservedPaths);
			let candidate = desiredPath;

			while (reservedPaths.has(candidate) || await this.options.vaultAdapter.exists(candidate)) {
				occupiedPaths.add(candidate);
				candidate = ensureUniquePath(occupiedPaths, desiredPath);
			}

			reservedPaths.add(candidate);
			assignedDrafts.push({
				...draft,
				targetPath: candidate,
			});
		}

		return assignedDrafts;
	}

	private async ensureParentFolders(path: string): Promise<void> {
		const parts = normalizeVaultPath(path).split("/");

		parts.pop();

		let currentPath = "";

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!(await this.options.vaultAdapter.exists(currentPath))) {
				await this.options.vaultAdapter.createFolder(currentPath);
			}
		}
	}

	private async writeDraft(draft: MarkdownWriteDraft): Promise<void> {
		if (draft.mode === "append") {
			await this.options.vaultAdapter.append(draft.targetPath, draft.content);
			return;
		}

		if (draft.mode === "modify") {
			throw new Error("Modify mode is not supported yet.");
		}

		await this.options.vaultAdapter.create(draft.targetPath, draft.content);
	}

	private async indexConceptSourceLinksAfterWrite(
		proposal: Awaited<ReturnType<KnowledgeProposalStore["getProposal"]>>,
		targetPaths: string[],
	): Promise<void> {
		if (
			!proposal
			|| proposal.kind !== "new_concept"
			|| !this.options.conceptSourceLinkStore
			|| !this.options.sourceAnalysisStore
		) {
			return;
		}

		const now = this.now();
		const conceptId = normalizeConceptIdForWrittenConcept({
			proposal,
			targetPaths,
		});
		const links = buildConceptSourceLinksFromNewConceptProposal({
			conceptId,
			now,
			proposal,
		});

		for (const link of links) {
			await this.options.conceptSourceLinkStore.upsertLink(link);
			const sourceRecord = await this.options.sourceAnalysisStore.getRecord(link.sourcePath);

			if (!sourceRecord) {
				continue;
			}

			await this.options.sourceAnalysisStore.upsertRecord(mergeLinkedConceptId(sourceRecord, conceptId));
		}
	}
}
