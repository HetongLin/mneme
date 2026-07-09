import {
	AI_CARD_GENERATION_MAX_PROPOSALS,
	AI_CARD_STAGE_KINDS,
	AI_CARD_GENERATION_KINDS,
	AI_CONCEPT_CAPTURE_KINDS,
	AI_PROPOSAL_MODE_CARD_GENERATION,
	AI_PROPOSAL_MODE_CONCEPT_CAPTURE,
	AI_PROPOSAL_SCHEMA_VERSION,
	AiProposalV1,
	AiStructuredProposalResponseV1,
} from "./aiProposalSchema";

export type AiProposalValidationResult =
	| { data: AiStructuredProposalResponseV1; errors: []; valid: true }
	| { data?: undefined; errors: string[]; valid: false };

export function validateAiStructuredProposalResponse(input: unknown): AiProposalValidationResult {
	const raw = repairCommonAiEnumDrift(input);
	const errors: string[] = [];

	if (!isRecord(raw)) {
		return invalid(["AI response must be an object."]);
	}

	requireLiteral(raw.schemaVersion, AI_PROPOSAL_SCHEMA_VERSION, "schemaVersion", errors);
	requireLiteralOneOf(raw.mode, [AI_PROPOSAL_MODE_CONCEPT_CAPTURE, AI_PROPOSAL_MODE_CARD_GENERATION], "mode", errors);
	const mode = raw.mode === AI_PROPOSAL_MODE_CONCEPT_CAPTURE || raw.mode === AI_PROPOSAL_MODE_CARD_GENERATION
		? raw.mode
		: undefined;

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
		if (mode === AI_PROPOSAL_MODE_CARD_GENERATION && raw.proposals.length > AI_CARD_GENERATION_MAX_PROPOSALS) {
			errors.push(`Card generation must return at most ${AI_CARD_GENERATION_MAX_PROPOSALS} proposals.`);
		}
		raw.proposals.forEach((proposal, index) => validateProposal(proposal, index, mode, errors));
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

function repairCommonAiEnumDrift(value: unknown): unknown {
	if (!isRecord(value) || !Array.isArray(value.proposals)) {
		return value;
	}

	let changed = false;
	const proposals = value.proposals.map((proposal) => {
		if (!isRecord(proposal) || !isRecord(proposal.payload)) {
			return proposal;
		}

		if (proposal.kind === "new_card") {
			const cardType = coerceCardType(proposal.payload.cardType);

			if (cardType === proposal.payload.cardType) {
				return proposal;
			}

			changed = true;

			return {
				...proposal,
				payload: {
					...proposal.payload,
					cardType,
				},
			};
		}

		if (proposal.kind !== "new_concept") {
			return proposal;
		}

		const learningMode = coerceLearningMode(proposal.payload.learningMode);
		const suggestedImportance = coerceSuggestedImportance(proposal.payload.suggestedImportance);
		const tags = normalizeTags(proposal.payload.tags);

		if (
			learningMode === proposal.payload.learningMode
			&& suggestedImportance === proposal.payload.suggestedImportance
			&& tags === proposal.payload.tags
		) {
			return proposal;
		}

		changed = true;

		return {
			...proposal,
			payload: {
				...proposal.payload,
				learningMode,
				suggestedImportance,
				tags,
			},
		};
	});

	if (!changed) {
		return value;
	}

	return {
		...value,
		proposals,
	};
}

function coerceLearningMode(value: unknown): "reviewable" | "exploratory" {
	if (typeof value !== "string") {
		return "reviewable";
	}

	const normalized = normalizeEnumToken(value);

	if (normalized === "exploratory" || normalized === "explore" || normalized === "exploration") {
		return "exploratory";
	}

	if (normalized === "optional" || normalized === "background" || normalized === "reference") {
		return "exploratory";
	}

	return "reviewable";
}

function coerceSuggestedImportance(value: unknown): "low" | "normal" | "high" | "critical" {
	if (typeof value !== "string") {
		return "normal";
	}

	const normalized = normalizeEnumToken(value);

	if (normalized === "low" || normalized === "minor" || normalized === "optional" || normalized === "background") {
		return "low";
	}

	if (normalized === "high" || normalized === "important" || normalized === "major") {
		return "high";
	}

	if (
		normalized === "critical"
		|| normalized === "essential"
		|| normalized === "must_master"
		|| normalized === "mustmaster"
		|| normalized === "very_high"
		|| normalized === "core"
		|| normalized === "exam"
	) {
		return "critical";
	}

	return "normal";
}

function coerceCardType(value: unknown): "definition" | "distinction" | "procedure" | "example" | "trap" | "proof" | "application" | "mastery" | "other" {
	if (typeof value !== "string") {
		return "other";
	}

	const normalized = normalizeEnumToken(value);

	if (
		normalized === "definition"
		|| normalized === "basic"
		|| normalized === "basic_recall"
		|| normalized === "concept"
		|| normalized === "conceptual"
		|| normalized === "meaning"
		|| normalized === "recall"
		|| normalized === "what_is"
	) {
		return "definition";
	}

	if (
		normalized === "distinction"
		|| normalized === "compare"
		|| normalized === "comparison"
		|| normalized === "contrast"
		|| normalized === "difference"
	) {
		return "distinction";
	}

	if (
		normalized === "procedure"
		|| normalized === "calculation"
		|| normalized === "how_to"
		|| normalized === "method"
		|| normalized === "process"
		|| normalized === "steps"
	) {
		return "procedure";
	}

	if (normalized === "example" || normalized === "case" || normalized === "scenario") {
		return "example";
	}

	if (
		normalized === "trap"
		|| normalized === "common_trap"
		|| normalized === "misconception"
		|| normalized === "pitfall"
	) {
		return "trap";
	}

	if (
		normalized === "proof"
		|| normalized === "derivation"
		|| normalized === "explanation"
		|| normalized === "theorem"
	) {
		return "proof";
	}

	if (
		normalized === "application"
		|| normalized === "applied"
		|| normalized === "use"
		|| normalized === "use_case"
	) {
		return "application";
	}

	if (
		normalized === "mastery"
		|| normalized === "synthesis"
		|| normalized === "integration"
		|| normalized === "comprehensive"
	) {
		return "mastery";
	}

	if (normalized === "other") {
		return "other";
	}

	return "other";
}

function normalizeEnumToken(value: string): string {
	return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return [...new Set(value
		.map((tag) => typeof tag === "string" ? normalizeTag(tag) : "")
		.filter((tag): tag is string => tag.length > 0))]
		.slice(0, 5);
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

function validateProposal(
	value: unknown,
	index: number,
	mode: typeof AI_PROPOSAL_MODE_CONCEPT_CAPTURE | typeof AI_PROPOSAL_MODE_CARD_GENERATION | undefined,
	errors: string[],
): void {
	const path = `proposals.${index}`;

	if (!isRecord(value)) {
		errors.push(`${path} must be an object.`);
		return;
	}

	if (mode === AI_PROPOSAL_MODE_CONCEPT_CAPTURE && typeof value.kind === "string" && (AI_CARD_STAGE_KINDS as readonly string[]).includes(value.kind)) {
		errors.push(`Concept capture must not return ${value.kind} proposals.`);
		return;
	}

	if (mode === AI_PROPOSAL_MODE_CARD_GENERATION && typeof value.kind === "string" && !(AI_CARD_GENERATION_KINDS as readonly string[]).includes(value.kind)) {
		errors.push(`Card generation must not return ${value.kind} proposals.`);
		return;
	}

	const allowedKinds = mode === AI_PROPOSAL_MODE_CARD_GENERATION
		? AI_CARD_GENERATION_KINDS
		: AI_CONCEPT_CAPTURE_KINDS;

	if (typeof value.kind !== "string" || !(allowedKinds as readonly string[]).includes(value.kind)) {
		errors.push(`${path}.kind must be supported for ${mode ?? "the requested mode"}.`);
		return;
	}

	requireNonEmptyString(value.title, `${path}.title`, errors);
	requireNonEmptyString(value.rationale, `${path}.rationale`, errors);
	validateConfidence(value.confidence, `${path}.confidence`, errors);
	validateEvidenceArray(value.evidence, `${path}.evidence`, errors);
	if (mode === AI_PROPOSAL_MODE_CARD_GENERATION && Array.isArray(value.evidence) && value.evidence.length === 0) {
		errors.push(`${path}.evidence must identify approved Concept grounding.`);
	}

	const payload = getRecord(value, "payload", errors, `${path}.payload`);
	if (!payload) {
		return;
	}

	switch (value.kind as AiProposalV1["kind"]) {
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
		case "new_card":
			validateNewCardPayload(payload, path, errors);
			break;
	}
}

function validateNewCardPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.conceptId, `${path}.payload.conceptId`, errors);
	requireNonEmptyString(payload.conceptTitle, `${path}.payload.conceptTitle`, errors);
	requireNonEmptyString(payload.front, `${path}.payload.front`, errors);
	requireNonEmptyString(payload.back, `${path}.payload.back`, errors);
	requireNonEmptyString(payload.rubric, `${path}.payload.rubric`, errors);
	requireLiteralOneOf(payload.cardType, [
		"definition",
		"distinction",
		"procedure",
		"example",
		"trap",
		"proof",
		"application",
		"mastery",
		"other",
	], `${path}.payload.cardType`, errors);
}

function validateNewConceptPayload(payload: Record<string, unknown>, path: string, errors: string[]): void {
	requireNonEmptyString(payload.conceptTitle, `${path}.payload.conceptTitle`, errors);
	requireNonEmptyString(payload.summary, `${path}.payload.summary`, errors);
	requireNonEmptyString(payload.coreMeaning, `${path}.payload.coreMeaning`, errors);
	requireLiteralOneOf(payload.learningMode, ["reviewable", "exploratory"], `${path}.payload.learningMode`, errors);
	requireLiteralOneOf(payload.suggestedImportance, ["low", "normal", "high", "critical"], `${path}.payload.suggestedImportance`, errors);
	validateTagArray(payload.tags, `${path}.payload.tags`, errors);
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

function validateTagArray(value: unknown, path: string, errors: string[]): void {
	if (!Array.isArray(value) || value.length === 0 || value.length > 5 || !value.every(isNonEmptyString)) {
		errors.push(`${path} must be an array of 1 to 5 non-empty strings.`);
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
