import assert from "node:assert/strict";
import type { AiStructuredProposalResponseV1 } from "../src/services/aiProposalSchema";
import { normalizeAiStructuredProposalResponse } from "../src/services/aiProposalNormalizer";
import { validateAiStructuredProposalResponse } from "../src/services/aiProposalValidator";

const baseResponse: AiStructuredProposalResponseV1 = {
	mode: "concept_capture",
	proposals: [],
	schemaVersion: "mneme.ai.proposals.v1",
	source: {
		hash: "source-hash",
		path: "Notes/OOP.md",
	},
	warnings: [],
};

const evidence = [{
	explanation: "The note defines the concept directly.",
	quote: "Encapsulation hides internal representation behind methods.",
	sourcePath: "Notes/OOP.md",
}];

const cardGenerationResponse = {
	mode: "card_generation",
	proposals: [{
		confidence: 0.9,
		evidence,
		kind: "new_card",
		payload: {
			back: "Encapsulation protects representation behind a stable interface.",
			cardType: "definition",
			conceptId: "concept-encapsulation",
			conceptTitle: "Encapsulation",
			front: "What does encapsulation protect?",
			rubric: "Mentions representation and a stable interface.",
		},
		rationale: "Tests the Concept's core meaning.",
		title: "Encapsulation core meaning",
	}],
	schemaVersion: "mneme.ai.proposals.v1",
	source: {
		hash: "concept-hash",
		path: "Mneme/Concepts/Encapsulation/Concept.md",
	},
	warnings: [],
};

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.91,
			evidence,
			kind: "new_concept",
			payload: {
				conceptTitle: "Encapsulation",
				coreMeaning: "Encapsulation protects internal representation.",
				learningMode: "reviewable",
				relatedConceptHints: ["Abstraction"],
				suggestedImportance: "normal",
				summary: "A boundary around representation details.",
				tags: ["oop", "design"],
				views: [{ body: "Think of public methods as the object's interface.", title: "Interface view" }],
			},
			rationale: "The source note introduces a durable concept.",
			title: "Encapsulation",
		}],
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.91,
			evidence,
			kind: "new_concept",
			payload: {
				conceptTitle: "Encapsulation",
				coreMeaning: "Encapsulation protects internal representation.",
				learningMode: "application",
				relatedConceptHints: ["Abstraction"],
				suggestedImportance: "medium",
				summary: "A boundary around representation details.",
				tags: ["Object Oriented Programming", "#design"],
				views: [{ body: "Think of public methods as the object's interface.", title: "Interface view" }],
			},
			rationale: "The source note introduces a durable concept.",
			title: "Encapsulation",
		}],
	});

	assert.equal(result.valid, true);

	if (result.valid) {
		const proposal = result.data.proposals[0];

		assert.equal(proposal.kind, "new_concept");

		if (proposal.kind === "new_concept") {
			assert.equal(proposal.payload.learningMode, "reviewable");
			assert.equal(proposal.payload.suggestedImportance, "normal");
			assert.deepEqual(proposal.payload.tags, ["object-oriented-programming", "design"]);
		}
	}
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.8,
			evidence,
			kind: "link_existing_concept",
			payload: {
				existingConceptId: "concept-encapsulation",
				existingConceptTitle: "Encapsulation",
				reason: "The note supports an existing concept.",
			},
			rationale: "Existing concept match is clear.",
			title: "Encapsulation",
		}],
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.82,
			evidence,
			kind: "add_view",
			payload: {
				targetConceptId: "concept-encapsulation",
				targetConceptTitle: "Encapsulation",
				viewBody: "Focus on what callers can rely on.",
				viewTitle: "Caller contract",
			},
			rationale: "The source adds a useful perspective.",
			title: "Encapsulation as caller contract",
		}],
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.76,
			evidence,
			kind: "update_concept",
			payload: {
				proposedCoreMeaning: "Encapsulation separates interface from representation.",
				reason: "The note sharpens the concept definition.",
				targetConceptId: "concept-encapsulation",
				targetConceptTitle: "Encapsulation",
			},
			rationale: "The update is specific and grounded.",
			title: "Update Encapsulation",
		}],
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.7,
			evidence,
			kind: "merge_concept",
			payload: {
				proposedTitle: "Encapsulation",
				reason: "The two concepts describe the same boundary.",
				sourceConceptIds: ["concept-encapsulation", "concept-information-hiding"],
			},
			rationale: "The concepts overlap strongly.",
			title: "Merge Encapsulation concepts",
		}],
	});

	assert.equal(result.valid, true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		schemaVersion: undefined,
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.some((error) => error.includes("schemaVersion")), true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		mode: "unsupported_mode",
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.some((error) => error.includes("mode")), true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.5,
			evidence,
			kind: "new_card",
			payload: {},
			rationale: "No cards during concept capture.",
			title: "Invalid Card",
		}],
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors[0], "Concept capture must not return new_card proposals.");
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 2,
			evidence,
			kind: "new_concept",
			payload: {
				conceptTitle: "Encapsulation",
				coreMeaning: "Encapsulation protects internal representation.",
				learningMode: "reviewable",
				relatedConceptHints: [],
				suggestedImportance: "normal",
				summary: "A boundary around representation details.",
				tags: ["oop"],
				views: [],
			},
			rationale: "Invalid confidence.",
			title: "Encapsulation",
		}],
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.some((error) => error.includes("confidence")), true);
}

{
	const result = validateAiStructuredProposalResponse({
		...baseResponse,
		proposals: [{
			confidence: 0.5,
			evidence,
			kind: "new_concept",
			payload: {
				conceptTitle: "",
				coreMeaning: "Encapsulation protects internal representation.",
				learningMode: "reviewable",
				relatedConceptHints: [],
				suggestedImportance: "normal",
				summary: "A boundary around representation details.",
				tags: ["oop"],
				views: [],
			},
			rationale: "Invalid title.",
			title: "",
		}],
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.some((error) => error.includes("title")), true);
}

{
	const raw = {
		...baseResponse,
		proposals: [{
			confidence: 0.91,
			createdAt: "1900-01-01T00:00:00.000Z",
			evidence,
			kind: "new_concept",
			payload: {
				conceptTitle: "Encapsulation",
				coreMeaning: "Encapsulation protects internal representation.",
				learningMode: "reviewable",
				relatedConceptHints: ["Abstraction"],
				suggestedImportance: "normal",
				summary: "A boundary around representation details.",
				tags: ["oop", "design"],
				views: [],
			},
			rationale: "The source note introduces a durable concept.",
			status: "written",
			title: "Encapsulation",
			updatedAt: "1900-01-01T00:00:00.000Z",
		}],
	};
	const validated = validateAiStructuredProposalResponse(raw);

	assert.equal(validated.valid, true);

	if (validated.valid) {
		const proposals = normalizeAiStructuredProposalResponse(validated.data, {
			idFactory: () => "proposal-ai-1",
			now: "2026-01-01T12:00:00.000Z",
		});

		assert.equal(proposals.length, 1);
		assert.equal(proposals[0].id, "proposal-ai-1");
		assert.equal(proposals[0].kind, "new_concept");
		assert.equal(proposals[0].status, "suggested");
		assert.equal(proposals[0].createdAt, "2026-01-01T12:00:00.000Z");
		assert.equal(proposals[0].updatedAt, "2026-01-01T12:00:00.000Z");
		assert.equal(proposals[0].sourcePath, "Notes/OOP.md");
		assert.equal(proposals[0].sourceHash, "source-hash");
		assert.equal(proposals[0].ai?.confidence, 0.91);
		assert.equal(proposals[0].ai?.rationale, "The source note introduces a durable concept.");
	}
}

{
	const validated = validateAiStructuredProposalResponse(cardGenerationResponse);

	assert.equal(validated.valid, true);

	if (validated.valid) {
		const proposals = normalizeAiStructuredProposalResponse(validated.data, {
			idFactory: () => "proposal-card-1",
			now: "2026-01-01T12:00:00.000Z",
		});

		assert.equal(proposals[0]?.kind, "new_card");
		assert.equal(proposals[0]?.conceptId, "concept-encapsulation");
		assert.equal(proposals[0]?.payload?.conceptId, "concept-encapsulation");
		assert.equal(proposals[0]?.payload?.card.front, "What does encapsulation protect?");
		assert.equal(proposals[0]?.sourcePath, "Mneme/Concepts/Encapsulation/Concept.md");
	}
}

{
	const validated = validateAiStructuredProposalResponse({
		...cardGenerationResponse,
		proposals: [{
			...cardGenerationResponse.proposals[0],
			payload: {
				...cardGenerationResponse.proposals[0].payload,
				cardType: "basic recall",
			},
		}, {
			...cardGenerationResponse.proposals[0],
			payload: {
				...cardGenerationResponse.proposals[0].payload,
				cardType: "worked problem",
			},
		}],
	});

	assert.equal(validated.valid, true);

	if (validated.valid) {
		assert.equal(validated.data.proposals[0]?.kind, "new_card");
		assert.equal(validated.data.proposals[1]?.kind, "new_card");

		if (validated.data.proposals[0]?.kind === "new_card" && validated.data.proposals[1]?.kind === "new_card") {
			assert.equal(validated.data.proposals[0].payload.cardType, "definition");
			assert.equal(validated.data.proposals[1].payload.cardType, "other");
		}
	}
}

{
	const result = validateAiStructuredProposalResponse({
		...cardGenerationResponse,
		proposals: [{
			...cardGenerationResponse.proposals[0],
			kind: "new_concept",
		}],
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors[0], "Card generation must not return new_concept proposals.");
}

console.log("AI proposal schema tests passed.");
