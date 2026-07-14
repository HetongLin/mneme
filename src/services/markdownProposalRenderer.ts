import type { KnowledgeProposal, NewCardProposalPayload, NewConceptProposalPayload } from "../models/knowledgeProposal";
import type { MarkdownWriteDraft } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import {
	buildCardGroupPath,
	buildConceptPath,
	createMnemeConceptId,
	slugifyForFilename,
	toObsidianInternalLink,
} from "../utils/markdownPath";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";
import { renderConceptMarkdown } from "./conceptMarkdownRenderer";

export type MarkdownProposalRenderResult =
	| { drafts: MarkdownWriteDraft[]; status: "rendered" }
	| { message: string; status: "invalid" | "unsupported" };

const WRITABLE_PROPOSAL_KINDS = new Set<KnowledgeProposal["kind"]>([
	"new_concept",
	"new_card",
]);

export function isMarkdownWritableProposalKind(kind: KnowledgeProposal["kind"]): boolean {
	return WRITABLE_PROPOSAL_KINDS.has(kind);
}

export function renderMarkdownProposal(
	proposal: KnowledgeProposal,
	settings: MnemeSettings,
): MarkdownProposalRenderResult {
	if (!isMarkdownWritableProposalKind(proposal.kind)) {
		return {
			message: `Proposal kind is not supported for Markdown writing yet: ${proposal.kind}`,
			status: "unsupported",
		};
	}

	const validation = validateKnowledgeProposalPayload(proposal);

	if (!validation.valid) {
		return {
			message: validation.errors.join(" ") || "Proposal payload is invalid.",
			status: "invalid",
		};
	}

	if (proposal.kind === "new_concept") {
		return {
			drafts: [renderNewConceptDraft(proposal, settings, proposal.payload as NewConceptProposalPayload)],
			status: "rendered",
		};
	}

	return {
		drafts: [renderNewCardDraft(proposal, settings, proposal.payload as NewCardProposalPayload)],
		status: "rendered",
	};
}

function renderNewConceptDraft(
	proposal: KnowledgeProposal,
	settings: MnemeSettings,
	payload: NewConceptProposalPayload,
): MarkdownWriteDraft {
	const conceptId = proposal.conceptId ?? createMnemeConceptId(payload.title);
	const conceptPath = buildConceptPath(settings.conceptsFolder, payload.title);
	const cardGroupPath = buildCardGroupPath(settings.cardsFolder, payload.title);
	const cardGroupLink = toObsidianInternalLink(cardGroupPath, `${payload.title} Cards`);

	return {
		content: renderConceptMarkdown({
			cardGroupLink,
			conceptId,
			coreMeaning: payload.coreMeaning || "",
			importance: payload.suggestedImportance,
			learningMode: payload.learningMode,
			sourceLinks: payload.proposedSourceLinks,
			sourcePath: proposal.sourcePath,
			tags: payload.tags,
			title: payload.title,
			views: payload.proposedViews,
			whyItMatters: payload.whyItMatters,
		}),
		kind: "concept",
		mode: "create",
		sourceProposalId: proposal.id,
		targetPath: conceptPath,
	};
}

function renderNewCardDraft(
	proposal: KnowledgeProposal,
	settings: MnemeSettings,
	payload: NewCardProposalPayload,
): MarkdownWriteDraft {
	const conceptLabel = payload.conceptTitle || payload.conceptId || proposal.conceptId || "Concept";
	const conceptId = payload.conceptId || proposal.conceptId || createMnemeConceptId(conceptLabel);
	const conceptPath = buildConceptPath(settings.conceptsFolder, payload.conceptTitle || conceptLabel);
	const conceptLink = toObsidianInternalLink(conceptPath, payload.conceptTitle || conceptLabel);
	const cardId = createTemporaryWriterCardId(conceptLabel, payload.card.front, proposal.id);
	const cardTypeAttribute = payload.card.cardType
		? ` type="${escapeHtmlAttribute(payload.card.cardType)}"`
		: "";
	const lines = [
		"---",
		"mneme_type: card_group",
		`mneme_concept_id: ${conceptId}`,
		"mneme_version: 1",
		`concept: "${escapeYamlDoubleQuoted(conceptLink)}"`,
		"---",
		"",
		`# ${conceptLabel} Cards`,
		"",
		"<!-- Mneme cards below -->",
		"",
		`<!-- MNEME:CARD:start id="${escapeHtmlAttribute(cardId)}"${cardTypeAttribute} -->`,
		"<!-- MNEME:FRONT:start -->",
		payload.card.front,
		"<!-- MNEME:FRONT:end -->",
		"",
		"<!-- MNEME:BACK:start -->",
		payload.card.back,
		"<!-- MNEME:BACK:end -->",
	];

	if (payload.card.rubric) {
		lines.push(
			"",
			"<!-- MNEME:RUBRIC:start -->",
			payload.card.rubric,
			"<!-- MNEME:RUBRIC:end -->",
		);
	}

	lines.push("<!-- MNEME:CARD:end -->", "");

	return {
		content: lines.join("\n"),
		kind: "card",
		mode: "upsert_card_group",
		sourceProposalId: proposal.id,
		targetPath: buildCardGroupPath(settings.cardsFolder, conceptLabel),
	};
}

export function createTemporaryWriterCardId(
	conceptTitleOrId: string,
	front: string,
	proposalId: string,
): string {
	const base = slugifyForFilename(`${conceptTitleOrId} ${front}`)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	const proposalSuffix = `p${stableStringHash(proposalId)}`;
	const readableBase = (base || "mneme-card").slice(0, Math.max(1, 95 - proposalSuffix.length));

	return `${readableBase}-${proposalSuffix}`;
}

function stableStringHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
