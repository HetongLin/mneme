import type { KnowledgeProposal } from "../models/knowledgeProposal";

export interface KnowledgeProposalValidationResult {
	errors: string[];
	valid: boolean;
	warnings: string[];
}

export function validateKnowledgeProposalPayload(proposal: KnowledgeProposal): KnowledgeProposalValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const payload = isRecord(proposal.payload) ? proposal.payload : undefined;

	if (!payload) {
		return createResult(["Proposal payload is required."], warnings);
	}

	switch (proposal.kind) {
		case "new_concept":
			requireString(payload, "title", "New concept title is required.", errors);
			break;
		case "new_card":
			validateCard(getRecord(payload, "card"), "Card", errors);
			break;
		case "revise_card":
			requireString(payload, "cardId", "Card id is required.", errors);
			validateCard(getRecord(payload, "revisedCard"), "Revised card", errors);
			break;
		case "retire_card":
			requireString(payload, "cardId", "Card id is required.", errors);
			break;
		case "link_existing_concept":
			requireString(payload, "targetConceptId", "Target concept id is required.", errors);
			validateSourceLink(getRecord(payload, "proposedSourceLink"), errors);
			break;
		case "merge_card":
			validateStringArray(payload.sourceCardIds, 2, "At least two source card ids are required.", errors);
			validateCard(getRecord(payload, "mergedCard"), "Merged card", errors);
			break;
		case "split_card":
			requireString(payload, "sourceCardId", "Source card id is required.", errors);
			validateCardArray(payload.replacementCards, 2, "At least two replacement cards are required.", errors);
			break;
		case "merge_concept":
			requireString(payload, "targetConceptId", "Target concept id is required.", errors);
			break;
		case "add_view":
			requireString(payload, "conceptId", "Concept id is required.", errors);
			validateView(getRecord(payload, "view"), errors);
			break;
		case "update_concept":
			requireString(payload, "conceptId", "Concept id is required.", errors);
			break;
	}

	return createResult(errors, warnings);
}

function validateCard(
	card: Record<string, unknown> | undefined,
	label: string,
	errors: string[],
): void {
	if (!card) {
		errors.push(`${label} is required.`);
		return;
	}

	requireString(card, "front", `${label} front is required.`, errors);
	requireString(card, "back", `${label} back is required.`, errors);
}

function validateCardArray(
	value: unknown,
	minLength: number,
	errorMessage: string,
	errors: string[],
): void {
	if (!Array.isArray(value) || value.length < minLength) {
		errors.push(errorMessage);
		return;
	}

	value.forEach((card, index) => {
		validateCard(isRecord(card) ? card : undefined, `Replacement card ${index + 1}`, errors);
	});
}

function validateSourceLink(
	link: Record<string, unknown> | undefined,
	errors: string[],
): void {
	if (!link) {
		errors.push("Proposed source link is required.");
		return;
	}

	requireString(link, "sourcePath", "Proposed source link source path is required.", errors);
}

function validateView(
	view: Record<string, unknown> | undefined,
	errors: string[],
): void {
	if (!view) {
		errors.push("Concept view is required.");
		return;
	}

	requireString(view, "title", "Concept view title is required.", errors);
	requireString(view, "body", "Concept view body is required.", errors);
}

function validateStringArray(
	value: unknown,
	minLength: number,
	errorMessage: string,
	errors: string[],
): void {
	if (
		!Array.isArray(value)
		|| value.length < minLength
		|| !value.every((item) => typeof item === "string" && item.trim().length > 0)
	) {
		errors.push(errorMessage);
	}
}

function requireString(
	record: Record<string, unknown>,
	key: string,
	errorMessage: string,
	errors: string[],
): void {
	const value = record[key];

	if (typeof value !== "string" || value.trim().length === 0) {
		errors.push(errorMessage);
	}
}

function getRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const value = record[key];

	return isRecord(value) ? value : undefined;
}

function createResult(errors: string[], warnings: string[]): KnowledgeProposalValidationResult {
	return {
		errors,
		valid: errors.length === 0,
		warnings,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
