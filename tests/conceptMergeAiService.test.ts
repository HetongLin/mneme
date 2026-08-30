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

	const aliasesEnabledService = new ConceptMergeAiService({
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "mock",
			suggestEnglishAliases: true,
		}),
	});
	const englishDraft = await aliasesEnabledService.draftMerge({
		first: selected,
		firstMarkdown: "# A",
		second: duplicate,
		secondMarkdown: "# B",
	});
	assert.equal(englishDraft.englishName, undefined);
	const chineseDraft = await aliasesEnabledService.draftMerge({
		first: createConcept("concept-c", "间隔效应", "第一条核心含义。", "Spacing Effect"),
		firstMarkdown: "# 间隔效应",
		second: createConcept("concept-d", "间隔学习", "第二条核心含义。", "Spaced Learning"),
		secondMarkdown: "# 间隔学习",
	});
	assert.equal(chineseDraft.englishName, "Spacing Effect");

	const request = buildConceptMergeAiRequest(
		{ ...DEFAULT_SETTINGS, aiCaptureEnabled: true, aiProvider: "openai", openaiApiKey: "secret" },
		"inspection",
		{ selected: { conceptId: "concept-a", title: "A" } },
	);
	assert.match(request.url, /\/responses$/);
	assert.equal(JSON.stringify(request.body).includes("Do not select a merge"), true);

	const deepSeekDraftRequest = buildConceptMergeAiRequest(
		{
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "secret",
		},
		"draft",
		{ first: { title: "A" }, second: { title: "B" } },
	);
	const deepSeekDraftBody = deepSeekDraftRequest.body as {
		max_tokens?: number;
		messages?: Array<{ content?: string }>;
		response_format?: { type?: string };
		thinking?: { type?: string };
	};
	assert.equal(deepSeekDraftBody.response_format?.type, "json_object");
	assert.equal(deepSeekDraftBody.thinking?.type, "disabled");
	assert.equal((deepSeekDraftBody.max_tokens ?? 0) > 0, true);
	assert.equal(
		deepSeekDraftBody.messages?.some(({ content }) => content?.includes("JSON object")),
		true,
	);
	assert.equal(
		deepSeekDraftBody.messages?.some(({ content }) => content?.includes("\"coreMeaning\"")),
		true,
	);
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

function createConcept(
	conceptId: string,
	title: string,
	coreMeaning: string,
	englishName = title,
): ConceptSummary {
	return {
		conceptId,
		coreMeaning,
		englishName,
		path: `Mneme/Concepts/${conceptId}.md`,
		primaryTitle: title,
		title,
		whyItMatters: `${title} matters.`,
	};
}
