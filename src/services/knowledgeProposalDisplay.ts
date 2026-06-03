import type { KnowledgeProposal } from "../models/knowledgeProposal";

export function getProposalTitle(proposal: KnowledgeProposal): string {
	const payload = getPayloadRecord(proposal);

	switch (proposal.kind) {
		case "new_concept":
			return getString(payload, "title") ?? "New Concept";
		case "new_card": {
			const conceptTitle = getString(payload, "conceptTitle");
			return conceptTitle ? `New Card: ${conceptTitle}` : "New Card";
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
			return getString(payload, "summary")
				?? getString(payload, "coreMeaning")
				?? "No concept summary yet.";
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
			return getString(payload, "proposedSummary")
				?? getString(payload, "proposedCoreMeaning")
				?? getString(payload, "updateReason")
				?? "No update summary yet.";
		case "link_existing_concept":
			return getString(payload, "relationReason") ?? "No relation reason yet.";
		case "merge_concept":
			return getString(payload, "mergeReason")
				?? getString(payload, "proposedMergedSummary")
				?? "No merge summary yet.";
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

function getEvidenceCount(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
