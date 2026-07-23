import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	buildConceptMergeAiRequest,
	ConceptMergeAiService,
} from "../src/services/conceptMergeAiService";

const selected = createConcept("concept-a", "Spacing Effect", "First core.");
const duplicate = createConcept("concept-b", "spacing effect", "Second core.");
const service = new ConceptMergeAiService({
	settingsProvider: () => ({ ...DEFAULT_SETTINGS, aiCaptureEnabled: true, aiProvider: "mock" }),
});

async function run(): Promise<void> {
	const inspections = await service.inspectCandidates({ candidates: [duplicate], selected });
	assert.equal(inspections[0]?.classification, "likely_duplicate");
	assert.equal(inspections[0]?.conceptId, "concept-b");

	const draft = await service.draftMerge({
		first: selected,
		firstMarkdown: "# A",
		second: duplicate,
		secondMarkdown: "# B",
	});
	assert.equal(draft.coreMeaning, "First core.\n\nSecond core.");
	assert.equal(draft.title, "Spacing Effect");

	const request = buildConceptMergeAiRequest(
		{ ...DEFAULT_SETTINGS, aiCaptureEnabled: true, aiProvider: "openai", openaiApiKey: "secret" },
		"inspection",
		{ selected: { conceptId: "concept-a", title: "A" } },
	);
	assert.match(request.url, /\/responses$/);
	assert.equal(JSON.stringify(request.body).includes("Do not select a merge"), true);
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

function createConcept(conceptId: string, title: string, coreMeaning: string): ConceptSummary {
	return {
		conceptId,
		coreMeaning,
		englishName: title,
		path: `Mneme/Concepts/${conceptId}.md`,
		primaryTitle: title,
		title,
		whyItMatters: `${title} matters.`,
	};
}
