import type { KnowledgeProposal } from "../models/knowledgeProposal";
import type { SourceEvidence } from "../models/conceptSource";
import { formatCardTypeLabel } from "./cardTypeDisplay";
import { buildCardGroupPath } from "../utils/markdownPath";
import {
	createReadableCardId,
	createReadableCardIdBase,
	createReadableCardIdFromStem,
} from "./cardIdNaming";
import {
	composeConceptDisplayTitle,
	getConceptIdStem,
	resolveConceptEnglishName,
} from "./conceptNaming";

export interface ProposalHighlight {
	label: string;
	value: string;
}

export interface ProposalEvidenceDisplayItem {
	excerpt: string;
	heading?: string;
	lineEnd?: number;
	lineStart?: number;
	sourcePath?: string;
}

export function getProposalTitle(proposal: KnowledgeProposal): string {
	const payload = getPayloadRecord(proposal);

	switch (proposal.kind) {
		case "new_concept":
			return getConceptProposalDisplayTitle(payload) ?? "New Concept";
		case "new_card": {
			return getProposedCardId(proposal);
		}
		case "revise_card":
			return `Revise Card: ${getString(payload, "cardId") ?? proposal.cardId ?? "Unknown Card"}`;
		case "retire_card":
			return `Retire Card: ${getString(payload, "cardId") ?? proposal.cardId ?? "Unknown Card"}`;
		case "add_view":
			return `Add View${formatOptionalTarget(getString(payload, "conceptTitle"))}`;
		case "update_concept":
			return `Update Concept${formatOptionalTarget(getString(payload, "conceptTitle"))}`;
		case "link_existing_concept":
			return `Link Concept${formatOptionalTarget(getString(payload, "targetConceptTitle"))}`;
		case "merge_concept":
			return `Merge Concept${formatOptionalTarget(getString(payload, "targetConceptTitle"))}`;
		case "split_card":
			return `Split Card: ${getString(payload, "sourceCardId") ?? "Unknown Card"}`;
		case "merge_card":
			return "Merge Cards";
		default:
			return "Knowledge Proposal";
	}
}

export function getProposalHighlights(proposal: KnowledgeProposal): ProposalHighlight[] {
	const payload = getPayloadRecord(proposal);

	switch (proposal.kind) {
		case "new_concept":
			return compactHighlights([
				{ label: "English Name", value: getString(payload, "englishName") },
				{ label: "Core Meaning", value: getString(payload, "coreMeaning") },
				{ label: "Why It Matters", value: getString(payload, "whyItMatters") },
				{ label: "Learning Mode", value: getString(payload, "learningMode") },
				{ label: "Importance", value: getString(payload, "suggestedImportance") },
				{ label: "Tags", value: formatStringArray(payload?.tags) },
			]);
		case "new_card":
			return compactHighlights([
				{ label: "Card ID", value: getProposedCardId(proposal) },
				{ label: "Card Group", value: getProposedCardMarkdownFilename(proposal) },
				{ label: "Card Type", value: formatCardTypeLabel(getNestedString(payload, "card", "cardType")) },
				{ label: "Front", value: getNestedString(payload, "card", "front") },
				{ label: "Back", value: getNestedString(payload, "card", "back") },
				{ label: "Rubric", value: getNestedString(payload, "card", "rubric") },
				{ label: "Concept", value: getString(payload, "conceptTitle") ?? getString(payload, "conceptId") },
			]);
		case "add_view":
			return compactHighlights([
				{ label: "View", value: getNestedString(payload, "view", "title") },
				{ label: "Body", value: getNestedString(payload, "view", "body") },
				{ label: "Concept", value: getString(payload, "conceptTitle") ?? getString(payload, "conceptId") },
			]);
		case "update_concept":
			return compactHighlights([
				{ label: "Core Meaning", value: getString(payload, "proposedCoreMeaning") },
				{ label: "Why It Matters", value: getString(payload, "proposedWhyItMatters") },
				{ label: "Reason", value: getString(payload, "updateReason") },
				{ label: "Concept", value: getString(payload, "conceptTitle") ?? getString(payload, "conceptId") },
			]);
		default:
			return compactHighlights([
				{ label: "Preview", value: getProposalPreview(proposal) },
				{ label: "Target", value: getProposalTargetLabel(proposal) },
			]);
	}
}

function getConceptProposalDisplayTitle(payload: Record<string, unknown> | undefined): string | undefined {
	const title = getString(payload, "title");
	if (!title) return undefined;
	const englishName = resolveConceptEnglishName(getString(payload, "englishName"), title);
	return englishName ? composeConceptDisplayTitle(title, englishName) : title;
}

export function getProposedCardMarkdownFilename(proposal: KnowledgeProposal): string {
	const payload = getPayloadRecord(proposal);
	const conceptId = getString(payload, "conceptId") ?? proposal.conceptId;
	const conceptLabel = conceptId
		? getConceptIdStem(conceptId)
		: getString(payload, "conceptTitle") ?? "Concept";
	const path = buildCardGroupPath("Mneme/Cards", conceptLabel);
	const slashIndex = path.lastIndexOf("/");

	return slashIndex === -1 ? path : path.slice(slashIndex + 1);
}

export function getProposedCardId(proposal: KnowledgeProposal): string {
	const payload = getPayloadRecord(proposal);
	const conceptId = getString(payload, "conceptId") ?? proposal.conceptId;
	const cardType = getNestedString(payload, "card", "cardType");
	const explicitCardId = proposal.cardId ?? getString(payload, "cardId");

	if (explicitCardId && conceptId) {
		return repairLegacyDoubleStrippedCardId(explicitCardId, conceptId, cardType);
	}

	return explicitCardId
		?? (conceptId
			? createReadableCardId(conceptId, cardType)
			: createReadableCardIdFromStem(getString(payload, "conceptTitle") ?? "Concept", cardType));
}

function repairLegacyDoubleStrippedCardId(
	cardId: string,
	conceptId: string,
	cardType: string | undefined,
): string {
	const correctBase = createReadableCardIdBase(conceptId, cardType);
	const legacyBase = createReadableCardIdBase(getConceptIdStem(conceptId), cardType);

	if (legacyBase === correctBase) return cardId;
	if (cardId === legacyBase) return correctBase;
	if (cardId.startsWith(`${legacyBase}-`) && /^\d+$/.test(cardId.slice(legacyBase.length + 1))) {
		return `${correctBase}${cardId.slice(legacyBase.length)}`;
	}

	return cardId;
}

function truncateDisplayText(value: string, maxLength: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function getProposalSubtitle(proposal: KnowledgeProposal): string {
	const parts = [
		formatProposalKind(proposal.kind),
		getProposalSourcePath(proposal) ? `Source: ${getProposalSourcePath(proposal)}` : undefined,
		getProposalTargetLabel(proposal),
	];

	return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export function getProposalPreview(proposal: KnowledgeProposal): string {
	const payload = getPayloadRecord(proposal);

	switch (proposal.kind) {
		case "new_concept":
			return getString(payload, "coreMeaning")
				?? getString(payload, "whyItMatters")
				?? "No Concept content yet.";
		case "new_card":
			return getNestedString(payload, "card", "front") ?? "No card front yet.";
		case "revise_card":
			return getNestedString(payload, "revisedCard", "front") ?? "No revised card front yet.";
		case "retire_card":
			return getString(payload, "retireReason") ?? "No retire reason yet.";
		case "add_view":
			return getNestedString(payload, "view", "body")
				?? getNestedString(payload, "view", "title")
				?? "No view draft yet.";
		case "update_concept":
			return getString(payload, "proposedCoreMeaning")
				?? getString(payload, "proposedWhyItMatters")
				?? getString(payload, "updateReason")
				?? "No Concept update content yet.";
		case "link_existing_concept":
			return getString(payload, "relationReason") ?? "No relation reason yet.";
		case "merge_concept":
			return getString(payload, "mergeReason")
				?? getString(payload, "proposedMergedWhyItMatters")
				?? "No merge details yet.";
		case "split_card":
			return getString(payload, "splitReason") ?? "No split reason yet.";
		case "merge_card":
			return getString(payload, "mergeReason")
				?? getNestedString(payload, "mergedCard", "front")
				?? "No merged card preview yet.";
		default:
			return "No proposal payload yet.";
	}
}

export function getProposalEvidenceCount(proposal: KnowledgeProposal): number {
	return getEvidenceCount(proposal.evidence) + countNestedEvidence(proposal.payload);
}

export function getProposalEvidenceItems(proposal: KnowledgeProposal): ProposalEvidenceDisplayItem[] {
	const evidence = collectEvidenceItems(proposal.payload, getProposalSourcePath(proposal));

	return dedupeEvidenceItems([
		...(proposal.evidence ?? []).map((item) => toEvidenceDisplayItem(item, getProposalSourcePath(proposal))),
		...evidence,
	]);
}

export function getProposalSourcePath(proposal: KnowledgeProposal): string | undefined {
	const payload = getPayloadRecord(proposal);

	return proposal.sourcePath
		?? getString(payload, "sourcePath")
		?? getNestedString(payload, "card", "sourcePath")
		?? getNestedString(payload, "revisedCard", "sourcePath")
		?? getNestedString(payload, "proposedSourceLink", "sourcePath");
}

export function getProposalTargetLabel(proposal: KnowledgeProposal): string | undefined {
	const payload = getPayloadRecord(proposal);
	const conceptTitle = getString(payload, "conceptTitle")
		?? getString(payload, "targetConceptTitle")
		?? getString(payload, "sourceConceptTitle");
	const conceptId = proposal.conceptId
		?? getString(payload, "conceptId")
		?? getString(payload, "targetConceptId")
		?? getString(payload, "sourceConceptId");
	const cardId = proposal.cardId
		?? getString(payload, "cardId")
		?? getString(payload, "sourceCardId");

	if (conceptTitle) {
		return `Concept: ${conceptTitle}`;
	}

	if (conceptId) {
		return `Concept: ${conceptId}`;
	}

	if (cardId) {
		return `Card: ${cardId}`;
	}

	return undefined;
}

export function formatProposalKind(kind: string): string {
	return kind
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatOptionalTarget(target: string | undefined): string {
	return target ? `: ${target}` : "";
}

function getPayloadRecord(proposal: KnowledgeProposal): Record<string, unknown> | undefined {
	return isRecord(proposal.payload) ? proposal.payload : undefined;
}

function getNestedString(
	parent: Record<string, unknown> | undefined,
	childKey: string,
	valueKey: string,
): string | undefined {
	if (!parent || !isRecord(parent[childKey])) {
		return undefined;
	}

	const child = parent[childKey];

	return isRecord(child) ? getString(child, valueKey) : undefined;
}

function getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!record) {
		return undefined;
	}

	const value = record[key];

	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function compactHighlights(highlights: Array<{ label: string; value?: string }>): ProposalHighlight[] {
	return highlights
		.filter((highlight): highlight is ProposalHighlight => Boolean(highlight.value?.trim()))
		.map((highlight) => ({
			label: highlight.label,
			value: truncateForList(highlight.value),
		}));
}

function formatStringArray(value: unknown): string | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const strings = value
		.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
		.map((item) => item.trim());

	return strings.length > 0 ? strings.join(", ") : undefined;
}

function truncateForList(value: string): string {
	const normalized = value.replace(/\s+/g, " ").trim();

	return normalized.length > 240
		? `${normalized.slice(0, 239).trim()}…`
		: normalized;
}

function countNestedEvidence(value: unknown): number {
	if (Array.isArray(value)) {
		return value.reduce((count, item) => count + countNestedEvidence(item), 0);
	}

	if (!isRecord(value)) {
		return 0;
	}

	return Object.entries(value).reduce((count, [key, child]) => {
		const ownEvidenceCount = key === "evidence" ? getEvidenceCount(child) : 0;

		return count + ownEvidenceCount + (key === "evidence" ? 0 : countNestedEvidence(child));
	}, 0);
}

function collectEvidenceItems(value: unknown, inheritedSourcePath?: string): ProposalEvidenceDisplayItem[] {
	if (Array.isArray(value)) {
		return value.flatMap((item) => collectEvidenceItems(item, inheritedSourcePath));
	}

	if (!isRecord(value)) {
		return [];
	}

	const sourcePath = getString(value, "sourcePath") ?? inheritedSourcePath;
	const ownEvidence = Array.isArray(value.evidence)
		? value.evidence
			.filter(isSourceEvidence)
			.map((item) => toEvidenceDisplayItem(item, sourcePath))
		: [];
	const nestedEvidence = Object.entries(value)
		.filter(([key]) => key !== "evidence")
		.flatMap(([, child]) => collectEvidenceItems(child, sourcePath));

	return [...ownEvidence, ...nestedEvidence];
}

function toEvidenceDisplayItem(evidence: SourceEvidence, sourcePath?: string): ProposalEvidenceDisplayItem {
	return {
		excerpt: evidence.excerpt,
		...(evidence.heading ? { heading: evidence.heading } : {}),
		...(typeof evidence.lineEnd === "number" ? { lineEnd: evidence.lineEnd } : {}),
		...(typeof evidence.lineStart === "number" ? { lineStart: evidence.lineStart } : {}),
		...(sourcePath ? { sourcePath } : {}),
	};
}

function dedupeEvidenceItems(items: ProposalEvidenceDisplayItem[]): ProposalEvidenceDisplayItem[] {
	const seen = new Set<string>();

	return items.filter((item) => {
		const key = [
			item.sourcePath ?? "",
			item.heading ?? "",
			item.lineStart ?? "",
			item.lineEnd ?? "",
			item.excerpt.trim(),
		].join("\u0000");

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return item.excerpt.trim().length > 0;
	});
}

function isSourceEvidence(value: unknown): value is SourceEvidence {
	if (!isRecord(value)) {
		return false;
	}

	return typeof value.excerpt === "string" && value.excerpt.trim().length > 0;
}

function getEvidenceCount(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
