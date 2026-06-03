import {
	AI_CARD_STAGE_KINDS,
	AI_CONCEPT_CAPTURE_KINDS,
	AI_PROPOSAL_MODE_CONCEPT_CAPTURE,
	AI_PROPOSAL_SCHEMA_VERSION,
	AiConceptProposalV1,
	AiStructuredProposalResponseV1,
} from "./aiProposalSchema";

export type AiProposalValidationResult =
	| { data: AiStructuredProposalResponseV1; errors: []; valid: true }
	| { data?: undefined; errors: string[]; valid: false };

export function validateAiStructuredProposalResponse(raw: unknown): AiProposalValidationResult {
	const errors: string[] = [];

	if (!isRecord(raw)) {
		return invalid(["AI response must be an object."]);
	}

	requireLiteral(raw.schemaVersion, AI_PROPOSAL_SCHEMA_VERSION, "schemaVersion", errors);
	requireLiteral(raw.mode, AI_PROPOSAL_MODE_CONCEPT_CAPTURE, "mode", errors);

	const source = getRecord(raw, "source", errors);
	if (source) {
		requireNonEmptyString(source.path, "source.path", errors);
		requireNonEmptyString(source.hash, "source.hash", errors);
	}

	if (!Array.isArray(raw.warnings) || !raw.warnings.every((warning) => typeof warning === "string")) {
		errors.push("warnings must be an array of strings.");
	}

	if (!Array.isArray(raw.proposals)) {
		errors.push("proposals must be an array.");
	} else {
		raw.proposals.forEach((proposal, index) => validateProposal(proposal, index, errors));
	}

	if (errors.length > 0) {
		return invalid(errors);
	}

	return {
		data: raw as unknown as AiStructuredProposalResponseV1,
		errors: [],
		valid: true,
	};
}

function validateProposal(value: unknown, index: number, errors: string[]): void {
	const path = `proposals.${index}`;

	if (!isRecord(value)) {
		errors.push(`${path} must be an object.`);
		return;
	}

	if (typeof value.kind === "string" && (AI_CARD_STAGE_KINDS as readonly string[]).includes(value.kind)) {
		errors.push(`Concept capture must not return ${value.kind} proposals.`);
		return;
	}

	if (typeof value.kind !== "string" || !(AI_CONCEPT_CAPTURE_KINDS as readonly string[]).includes(value.kind)) {
		errors.push(`${path}.kind must be a supported concept proposal kind.`);
		return;
	}

	requireNonEmptyString(value.title, `${path}.title`, errors);
	requireNonEmptyString(value.rationale, `${path}.rationale`, errors);
	validateConfidence(value.confidence, `${path}.confidence`, errors);
	validateEvidenceArray(value.evidence, `${path}.evidence`, errors);

	const payload = getRecord(value, "payload", errors, `${path}.payload`);
	if (!payload) {
		return;
	}

	switch (value.kind as AiConceptProposalV1["kind"]) {
		case "new_concept":
			validateNewConceptPayload(payload, path, errors);
			break;
		case "link_existing_concept":
			validateLinkExistingConceptPayload(payload, path, errors);
			break;
		case "add_view":
			validateAddViewPayload(payload, path, errors);
			break;
		case "update_concept":
			validateUpdateConceptPayload(payload, path, errors);
			break;
		case "merge_concept":
			validateMergeConceptPayload(payload, path, errors);
			break;
	}
}

function validateNewConceptPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.conceptTitle, `${path}.payload.conceptTitle`, errors);
	requireNonEmptyString(payload.summary, `${path}.payload.summary`, errors);
	requireNonEmptyString(payload.coreMeaning, `${path}.payload.coreMeaning`, errors);
	requireLiteralOneOf(payload.learningMode, ["reviewable", "exploratory"], `${path}.payload.learningMode`, errors);
	requireLiteralOneOf(payload.suggestedImportance, ["low", "normal", "high", "critical"], `${path}.payload.suggestedImportance`, errors);
	validateStringArray(payload.relatedConceptHints, `${path}.payload.relatedConceptHints`, errors);

	if (!Array.isArray(payload.views)) {
		errors.push(`${path}.payload.views must be an array.`);
		return;
	}

	payload.views.forEach((view, index) => {
		if (!isRecord(view)) {
			errors.push(`${path}.payload.views.${index} must be an object.`);
			return;
		}

		requireNonEmptyString(view.title, `${path}.payload.views.${index}.title`, errors);
		requireNonEmptyString(view.body, `${path}.payload.views.${index}.body`, errors);
	});
}

function validateLinkExistingConceptPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.existingConceptId, `${path}.payload.existingConceptId`, errors);
	requireNonEmptyString(payload.existingConceptTitle, `${path}.payload.existingConceptTitle`, errors);
	requireNonEmptyString(payload.reason, `${path}.payload.reason`, errors);
}

function validateAddViewPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.targetConceptId, `${path}.payload.targetConceptId`, errors);
	requireNonEmptyString(payload.targetConceptTitle, `${path}.payload.targetConceptTitle`, errors);
	requireNonEmptyString(payload.viewTitle, `${path}.payload.viewTitle`, errors);
	requireNonEmptyString(payload.viewBody, `${path}.payload.viewBody`, errors);
}

function validateUpdateConceptPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.targetConceptId, `${path}.payload.targetConceptId`, errors);
	requireNonEmptyString(payload.targetConceptTitle, `${path}.payload.targetConceptTitle`, errors);
	requireNonEmptyString(payload.reason, `${path}.payload.reason`, errors);

	const hasSummary = isNonEmptyString(payload.proposedSummary);
	const hasCoreMeaning = isNonEmptyString(payload.proposedCoreMeaning);

	if (!hasSummary && !hasCoreMeaning) {
		errors.push(`${path}.payload requires proposedSummary or proposedCoreMeaning.`);
	}
}

function validateMergeConceptPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.proposedTitle, `${path}.payload.proposedTitle`, errors);
	requireNonEmptyString(payload.reason, `${path}.payload.reason`, errors);

	if (!Array.isArray(payload.sourceConceptIds) || payload.sourceConceptIds.length < 2 || !payload.sourceConceptIds.every(isNonEmptyString)) {
		errors.push(`${path}.payload.sourceConceptIds must include at least two concept ids.`);
	}
}

function validateEvidenceArray(value: unknown, path: string, errors: string[]): void {
	if (!Array.isArray(value)) {
		errors.push(`${path} must be an array.`);
		return;
	}

	value.forEach((evidence, index) => {
		if (!isRecord(evidence)) {
			errors.push(`${path}.${index} must be an object.`);
			return;
		}

		requireNonEmptyString(evidence.sourcePath, `${path}.${index}.sourcePath`, errors);
		requireNonEmptyString(evidence.quote, `${path}.${index}.quote`, errors);
		requireNonEmptyString(evidence.explanation, `${path}.${index}.explanation`, errors);
	});
}

function validateConfidence(value: unknown, path: string, errors: string[]): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
		errors.push(`${path} must be a number from 0 to 1.`);
	}
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
	if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
		errors.push(`${path} must be an array of non-empty strings.`);
	}
}

function requireLiteral(value: unknown, expected: string, path: string, errors: string[]): void {
	if (value !== expected) {
		errors.push(`${path} must be ${expected}.`);
	}
}

function requireLiteralOneOf(value: unknown, expected: string[], path: string, errors: string[]): void {
	if (typeof value !== "string" || !expected.includes(value)) {
		errors.push(`${path} must be one of: ${expected.join(", ")}.`);
	}
}

function requireNonEmptyString(value: unknown, path: string, errors: string[]): void {
	if (!isNonEmptyString(value)) {
		errors.push(`${path} must be a non-empty string.`);
	}
}

function getRecord(
	record: Record<string, unknown>,
	key: string,
	errors: string[],
	path = key,
): Record<string, unknown> | undefined {
	if (!isRecord(record[key])) {
		errors.push(`${path} must be an object.`);
		return undefined;
	}

	return record[key] as Record<string, unknown>;
}

function invalid(errors: string[]): AiProposalValidationResult {
	return {
		errors,
		valid: false,
	};
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
