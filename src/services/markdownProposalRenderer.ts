import type { KnowledgeProposal, NewCardProposalPayload, NewConceptProposalPayload } from "../models/knowledgeProposal";
import type { MarkdownWriteDraft } from "../models/markdownWrite";
import type { MnemeSettings } from "../models/settings";
import {
	buildCardPath,
	buildConceptPath,
	createMnemeConceptId,
	slugifyForFilename,
	toObsidianInternalLink,
} from "../utils/markdownPath";
import { formatCardTypeTitle } from "../utils/cardTitle";
import { validateKnowledgeProposalPayload } from "./knowledgeProposalValidation";

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
	const cardFolderPath = `${settings.cardsFolder}/${slugifyForFilename(payload.title)}`;
	const tags = normalizeTags(payload.tags ?? []);
	const lines = [
		"---",
		"mneme_type: concept",
		`mneme_id: ${conceptId}`,
		"mneme_version: 1",
		`cards_folder: "${cardFolderPath}"`,
		...(payload.learningMode ? [`learning_mode: ${payload.learningMode}`] : []),
		...(payload.suggestedImportance ? [`importance: ${payload.suggestedImportance}`] : []),
		...(tags.length > 0 ? [`tags: [${tags.join(", ")}]`] : []),
		"---",
		"",
		`# ${payload.title}`,
		"",
		"## Core Meaning",
		"",
		payload.coreMeaning || payload.summary || "",
		"",
		"## Why It Matters",
		"",
		payload.summary && payload.summary !== payload.coreMeaning
			? payload.summary
			: "Add why this concept matters here.",
		"",
		"## Views",
		"",
	];

	if (payload.proposedViews && payload.proposedViews.length > 0) {
		for (const view of payload.proposedViews) {
			lines.push(`### ${view.title}`, "", view.body, "");
		}
	} else {
		lines.push("Add views here.", "");
	}

	lines.push("## Common Traps", "", "Add common traps here.", "");
	lines.push("## Review", "");
	lines.push(`Card folder: \`${cardFolderPath}/\``);
	lines.push("Generate and accept Cards to populate this folder.", "");

	lines.push("## Source Notes", "");

	if (payload.proposedSourceLinks && payload.proposedSourceLinks.length > 0) {
		lines.push("> [!info]- Source Notes");
		for (const link of payload.proposedSourceLinks) {
			lines.push(`> - ${toObsidianInternalLink(link.sourcePath)}`);
			lines.push(`>   - relation: ${link.relationType}`);
			const excerpt = link.evidence?.[0]?.excerpt;

			if (excerpt) {
				lines.push(`>   - evidence: ${truncateSingleLine(excerpt, 180)}`);
			}
		}
	} else if (proposal.sourcePath) {
		lines.push("> [!info]- Source Notes");
		lines.push(`> - ${toObsidianInternalLink(proposal.sourcePath)}`);
	} else {
		lines.push("> [!info]- Source Notes", "> Add source notes here.");
	}

	lines.push("", "## Related Concepts", "", "<!-- Add related concepts here. -->", "");

	return {
		content: lines.join("\n"),
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
	const cardTitle = payload.card.cardType ? formatCardTypeTitle(payload.card.cardType) : "Card";
	const cardId = createTemporaryWriterCardId(conceptLabel, payload.card.front, proposal.id);
	const lines = [
		"---",
		"mneme_type: card",
		`mneme_card_id: ${cardId}`,
		`mneme_concept_id: ${conceptId}`,
		"mneme_version: 1",
		`concept: "${conceptLink}"`,
		...(payload.card.cardType ? [`card_type: ${payload.card.cardType}`] : []),
		"---",
		"",
		`# ${cardTitle}`,
		"",
		`Related Concept: ${conceptLink}`,
		"",
		"<!-- Mneme cards below -->",
		"",
		`<!-- MNEME:CARD:start id="${escapeHtmlAttribute(cardId)}" -->`,
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
		mode: "create",
		sourceProposalId: proposal.id,
		targetPath: buildCardPath(settings.cardsFolder, conceptLabel, cardTitle),
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

function truncateSingleLine(value: string, maxLength: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();

	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function normalizeTags(value: string[]): string[] {
	const tags = value
		.map(normalizeTag)
		.filter((tag) => tag.length > 0);

	return [...new Set(tags)].slice(0, 5);
}

function normalizeTag(value: string): string {
	return value
		.trim()
		.replace(/^#+/, "")
		.replace(/^['"]|['"]$/g, "")
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9/_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
