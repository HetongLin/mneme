import type { SourceEvidence } from "../models/conceptSource";
import type { KnowledgeProposal } from "../models/knowledgeProposal";

export const ACCEPTANCE_SOURCE_PATH = "Mneme/Acceptance/Source Notes/Pre-AI Acceptance Source.md";
export const ACCEPTANCE_CONCEPT_TITLE = "Pre-AI Acceptance Pipeline";
export const ACCEPTANCE_CONCEPT_ID = "concept-pre-ai-acceptance-pipeline";
export const ACCEPTANCE_CONCEPT_PROPOSAL_ID = "acceptance:new-concept:pre-ai-acceptance-pipeline";
export const ACCEPTANCE_CARD_PROPOSAL_ID = "acceptance:new-card:pre-ai-acceptance-pipeline";
export const ACCEPTANCE_CARD_FRONT = "What does the pre-AI acceptance pipeline verify?";
export const ACCEPTANCE_CARD_BACK = "It verifies that Mneme can move a reviewed proposal through Inbox approval, Markdown writing, ConceptSourceLink indexing, Concept Library scanning, and Review regression without AI.";

export const ACCEPTANCE_SOURCE_NOTE_TEMPLATE = `# Pre-AI Acceptance Source

This source note is used to validate Mneme before AI Capture is connected.

It should support a Concept called Pre-AI Acceptance Pipeline.

The concept checks that Mneme can:
- index a Source Note
- create KnowledgeProposals
- review and approve proposals in Inbox
- write Concept.md and Card Group Markdown
- index ConceptSourceLinks
- show Concepts in Concept Library
- preserve Review and FSRS behavior
`;

export interface BuildPreAiAcceptanceProposalArgs {
	createdAt: string;
	sourceHash?: string;
	sourcePath?: string;
	updatedAt?: string;
}

export function buildPreAiAcceptanceConceptProposal(
	args: BuildPreAiAcceptanceProposalArgs,
): KnowledgeProposal & { kind: "new_concept" } {
	const evidence = createAcceptanceEvidence();

	return {
		conceptId: ACCEPTANCE_CONCEPT_ID,
		createdAt: args.createdAt,
		evidence,
		id: ACCEPTANCE_CONCEPT_PROPOSAL_ID,
		kind: "new_concept",
		payload: {
			coreMeaning: "Mneme's pre-AI acceptance pipeline proves that reviewed proposals can become readable Markdown and searchable Concepts without bypassing human approval.",
			learningMode: "reviewable",
			proposedSourceLinks: args.sourcePath ? [{
				evidence,
				relationType: "origin",
				sourceHash: args.sourceHash,
				sourcePath: args.sourcePath,
			}] : [],
			proposedViews: [{
				body: "Use this Concept to verify Mneme's pre-AI proposal flow before connecting AI Capture.",
				evidence,
				sourcePath: args.sourcePath,
				title: "Acceptance Flow",
			}],
			suggestedImportance: "normal",
			summary: "A deterministic fixture Concept for validating Mneme's source analysis, Inbox, Markdown writing, Concept Library, and Review regression flow before AI Capture.",
			tags: ["mneme", "acceptance-test"],
			title: ACCEPTANCE_CONCEPT_TITLE,
		},
		sourceHash: args.sourceHash,
		sourcePath: args.sourcePath,
		status: "suggested",
		updatedAt: args.updatedAt ?? args.createdAt,
	};
}

export function buildPreAiAcceptanceCardProposal(
	args: BuildPreAiAcceptanceProposalArgs,
): KnowledgeProposal & { kind: "new_card" } {
	const evidence = createAcceptanceEvidence();

	return {
		conceptId: ACCEPTANCE_CONCEPT_ID,
		createdAt: args.createdAt,
		evidence,
		id: ACCEPTANCE_CARD_PROPOSAL_ID,
		kind: "new_card",
		payload: {
			card: {
				back: ACCEPTANCE_CARD_BACK,
				cardType: "procedure",
				evidence,
				front: ACCEPTANCE_CARD_FRONT,
				rubric: "A correct answer mentions Inbox approval, explicit Markdown writing, ConceptSourceLink indexing, Concept Library scanning, and unchanged Review behavior.",
				sourcePath: args.sourcePath,
			},
			conceptId: ACCEPTANCE_CONCEPT_ID,
			conceptTitle: ACCEPTANCE_CONCEPT_TITLE,
		},
		sourceHash: args.sourceHash,
		sourcePath: args.sourcePath,
		status: "suggested",
		updatedAt: args.updatedAt ?? args.createdAt,
	};
}

function createAcceptanceEvidence(): SourceEvidence[] {
	return [{
		excerpt: "The concept checks that Mneme can index a Source Note, create KnowledgeProposals, write Concept.md and Card Group Markdown, index ConceptSourceLinks, show Concepts in Concept Library, and preserve Review and FSRS behavior.",
		heading: "Pre-AI Acceptance Source",
	}];
}
