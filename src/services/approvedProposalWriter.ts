import type { ConceptSummary } from "../models/conceptLibrary";
import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { MarkdownWriteDraft, MarkdownWriteResult } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import { ensureUniquePath, normalizeVaultPath } from "../utils/markdownPath";
import {
	buildConceptSourceLinksFromNewConceptProposal,
	buildExistingConceptSourceLink,
	buildViewSourceLink,
	mergeLinkedConceptId,
	normalizeConceptIdForWrittenConcept,
} from "./conceptSourceLinking";
import { ConceptSourceLinkStore } from "./conceptSourceLinkStore";
import { KnowledgeProposalStore } from "./knowledgeProposalStore";
import { renderMarkdownProposal } from "./markdownProposalRenderer";
import { SourceAnalysisStore } from "./sourceAnalysisStore";
import { appendConceptView } from "./conceptViewAppender";
import { appendConceptSourceNote } from "./conceptSourceNoteAppender";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";

export interface MnemeVaultAdapter {
	append(path: string, content: string): Promise<void>;
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

export interface ConceptSummaryScanner {
	scanConcepts(): Promise<ConceptSummary[]>;
}

export interface ApprovedProposalWriterOptions {
	conceptSourceLinkStore?: ConceptSourceLinkStore;
	conceptScanner?: ConceptSummaryScanner;
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

		if (proposal.kind === "link_existing_concept") {
			return this.writeExistingConceptLinkProposal(proposal);
		}

		if (proposal.kind === "add_view") {
			return this.writeConceptViewProposal(proposal);
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

	private async writeExistingConceptLinkProposal(
		proposal: Extract<KnowledgeProposal, { kind: "link_existing_concept" }>,
	): Promise<MarkdownWriteResult> {
		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid || !proposal.payload) {
			return this.failedResult(proposal.id, validation.errors.join(" ") || "Source link proposal is invalid.");
		}

		if (!this.options.conceptScanner || !this.options.conceptSourceLinkStore) {
			return {
				message: "Concept source linking is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		const payload = proposal.payload;

		try {
			const targetPath = await this.resolveConceptPath(payload.targetConceptId);
			const markdown = await this.options.vaultAdapter.read(targetPath);
			const appendResult = appendConceptSourceNote(markdown, payload.proposedSourceLink);

			if (appendResult.status === "appended") {
				await this.options.vaultAdapter.modify(targetPath, appendResult.markdown);
			}

			const now = this.now();
			const sourceLink = buildExistingConceptSourceLink({ now, proposal });

			if (!sourceLink) {
				throw new Error("Source link proposal is invalid.");
			}

			await this.options.conceptSourceLinkStore.upsertLink(sourceLink);
			const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(sourceLink.sourcePath);

			if (sourceRecord) {
				await this.options.sourceAnalysisStore?.upsertRecord(
					mergeLinkedConceptId(sourceRecord, payload.targetConceptId),
				);
			}

			await this.options.proposalStore.updateProposalStatus(proposal.id, "written", now);

			return {
				message: appendResult.status === "unchanged"
					? "Concept source link already written."
					: "Concept source link written.",
				proposalId: proposal.id,
				status: "written",
				targetPaths: [targetPath],
			};
		} catch (error) {
			return this.failedResult(
				proposal.id,
				error instanceof Error ? error.message : "Concept source link write failed.",
			);
		}
	}

	private async writeConceptViewProposal(
		proposal: Extract<KnowledgeProposal, { kind: "add_view" }>,
	): Promise<MarkdownWriteResult> {
		const validation = validateKnowledgeProposalPayload(proposal);

		if (!validation.valid || !proposal.payload) {
			return {
				message: validation.errors.join(" ") || "Add view proposal payload is invalid.",
				proposalId: proposal.id,
				status: "failed",
				targetPaths: [],
			};
		}

		const payload = proposal.payload;
		const now = this.now();
		const sourceLink = buildViewSourceLink({ now, proposal });

		if (sourceLink && !this.options.conceptSourceLinkStore) {
			return {
				message: "Concept source linking is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		if (!this.options.conceptScanner) {
			return {
				message: "Concept lookup is unavailable.",
				proposalId: proposal.id,
				status: "skipped",
				targetPaths: [],
			};
		}

		try {
			const targetPath = await this.resolveConceptPath(payload.conceptId);
			const markdown = await this.options.vaultAdapter.read(targetPath);
			const viewResult = appendConceptView(markdown, payload.view);
			const sourceResult = sourceLink
				? appendConceptSourceNote(viewResult.markdown, sourceLink)
				: undefined;
			const updatedMarkdown = sourceResult?.markdown ?? viewResult.markdown;

			if (viewResult.status === "appended" || sourceResult?.status === "appended") {
				await this.options.vaultAdapter.modify(targetPath, updatedMarkdown);
			}

			if (sourceLink) {
				await this.options.conceptSourceLinkStore?.upsertLink(sourceLink);
				const sourceRecord = await this.options.sourceAnalysisStore?.getRecord(sourceLink.sourcePath);

				if (sourceRecord) {
					await this.options.sourceAnalysisStore?.upsertRecord(
						mergeLinkedConceptId(sourceRecord, payload.conceptId),
					);
				}
			}

			await this.options.proposalStore.updateProposalStatus(proposal.id, "written", now);

			return {
				message: viewResult.status === "unchanged" && sourceResult?.status !== "appended"
					? "Concept view already written."
					: "Concept view written.",
				proposalId: proposal.id,
				status: "written",
				targetPaths: [targetPath],
			};
		} catch (error) {
			return {
				message: error instanceof Error ? error.message : "Concept view write failed.",
				proposalId: proposal.id,
				status: "failed",
				targetPaths: [],
			};
		}
	}

	private async resolveConceptPath(conceptId: string): Promise<string> {
		if (!this.options.conceptScanner) {
			throw new Error("Concept lookup is unavailable.");
		}

		const concepts = await this.options.conceptScanner.scanConcepts();
		const matches = concepts.filter((concept) => concept.conceptId === conceptId);

		if (matches.length === 0) {
			throw new Error(`Concept not found: ${conceptId}`);
		}

		if (matches.length > 1) {
			throw new Error(`Multiple Concept files use id: ${conceptId}`);
		}

		const targetConcept = matches[0];

		if (!targetConcept) {
			throw new Error(`Concept not found: ${conceptId}`);
		}

		return targetConcept.path;
	}

	private failedResult(proposalId: string, message: string): MarkdownWriteResult {
		return {
			message,
			proposalId,
			status: "failed",
			targetPaths: [],
		};
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
