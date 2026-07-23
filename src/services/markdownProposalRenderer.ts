import type {
	CardDraftType,
	KnowledgeProposal,
	NewCardProposalPayload,
	NewConceptProposalPayload,
} from "../models/knowledgeProposal";
import type { MarkdownWriteDraft } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import {
	buildCardGroupPath,
	buildConceptPath,
	createMnemeConceptId,
	toObsidianInternalLink,
} from "../utils/markdownPath";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";
import { renderConceptMarkdown } from "./conceptMarkdownRenderer";
import { createReadableCardId } from "./cardIdNaming";
import {
	createReadableConceptId,
	normalizeConceptNames,
} from "./conceptNaming";

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
	const names = normalizeConceptNames(payload.title, payload.englishName);
	const conceptId = createReadableConceptId(names.englishName);
	const conceptPath = buildConceptPath(settings.conceptsFolder, names.displayTitle);
	const cardGroupPath = buildCardGroupPath(settings.cardsFolder, names.displayTitle);
	const cardGroupLink = toObsidianInternalLink(cardGroupPath, `${names.displayTitle} Cards`);

	return {
		content: renderConceptMarkdown({
			cardGroupLink,
			conceptId,
			coreMeaning: payload.coreMeaning || "",
			englishName: names.englishName,
			importance: payload.suggestedImportance,
			learningMode: payload.learningMode,
			sourceLinks: payload.proposedSourceLinks,
			sourcePath: proposal.sourcePath,
			tags: payload.tags,
			title: names.title,
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
	const cardId = proposal.cardId ?? createReadableCardId(conceptId, payload.card.cardType);
	return {
		content: renderCardGroupMarkdown({
			back: payload.card.back,
			cardId,
			cardType: payload.card.cardType,
			conceptId,
			conceptLabel,
			conceptLink,
			front: payload.card.front,
			rubric: payload.card.rubric,
		}),
		kind: "card",
		mode: "upsert_card_group",
		sourceProposalId: proposal.id,
		targetPath: buildCardGroupPath(settings.cardsFolder, conceptLabel),
	};
}

export interface CardGroupMarkdownInput {
	back: string;
	cardId: string;
	cardType?: CardDraftType;
	conceptId: string;
	conceptLabel: string;
	conceptLink: string;
	front: string;
	rubric?: string;
}

export function renderCardGroupMarkdown(input: CardGroupMarkdownInput): string {
	const { back, cardId, cardType, conceptId, conceptLabel, conceptLink, front, rubric } = input;
	const cardTypeAttribute = cardType
		? ` type="${escapeHtmlAttribute(cardType)}"`
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
		front,
		"<!-- MNEME:FRONT:end -->",
		"",
		"<!-- MNEME:BACK:start -->",
		back,
		"<!-- MNEME:BACK:end -->",
	];

	if (rubric) {
		lines.push(
			"",
			"<!-- MNEME:RUBRIC:start -->",
			rubric,
			"<!-- MNEME:RUBRIC:end -->",
		);
	}

	lines.push("<!-- MNEME:CARD:end -->", "");
	return lines.join("\n");
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
