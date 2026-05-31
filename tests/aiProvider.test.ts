import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	CARD_STAGE_PROPOSAL_KINDS,
	toLogSafeAiConfig,
	validateAiProviderConfig,
	validateConceptCaptureResponse,
} from "../src/services/aiProvider";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { buildOpenAiKnowledgeProposalPayload, OpenAiProvider } from "../src/services/openAiProvider";

const request = {
	existingConceptSummaries: [{
		conceptId: "concept-encapsulation",
		summary: "Bundles data with behavior.",
		title: "Encapsulation",
	}],
	mode: "concept_capture" as const,
	sourceContent: "Encapsulation keeps object internals hidden behind a public interface.",
	sourceHash: "abc123456789",
	sourcePath: "Notes/OOP.md",
};

async function run(): Promise<void> {
{
	const provider = new MockAiProvider(DEFAULT_SETTINGS);
	const first = await provider.generateKnowledgeProposals(request);
	const second = await provider.generateKnowledgeProposals(request);

	assert.deepEqual(first.proposals, second.proposals);
	assert.equal(first.proposals.length, 1);
	assert.equal(first.proposals[0]?.kind, "new_concept");
	assert.equal(first.provider.provider, "mock");
}

{
	const provider = new MockAiProvider({
		...DEFAULT_SETTINGS,
		openaiApiKey: "sk-secret-value",
	});
	const response = await provider.generateKnowledgeProposals(request);
	const kinds = response.proposals.map((proposal) => proposal.kind);
	const serializedDiagnostics = JSON.stringify(response.diagnostics);

	assert.equal(kinds.some((kind) => CARD_STAGE_PROPOSAL_KINDS.includes(kind)), false);
	assert.equal(validateConceptCaptureResponse(response.proposals).valid, true);
	assert.equal(serializedDiagnostics.includes("sk-secret-value"), false);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	assert.equal(result.valid, false);
	assert.equal(result.errors.includes("OpenAI API key is required when AI capture is enabled with the OpenAI provider."), true);
}

{
	const result = validateAiProviderConfig({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: false,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	assert.equal(result.valid, true);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
		openaiBaseUrl: "https://api.openai.com/v1",
		openaiModel: "gpt-test",
	};
	const logSafe = toLogSafeAiConfig(settings);
	const serialized = JSON.stringify(logSafe);

	assert.equal(logSafe.openaiApiKeyConfigured, true);
	assert.equal(serialized.includes("sk-secret-value"), false);
}

{
	const settings = {
		...DEFAULT_SETTINGS,
		aiMaxInputChars: 12,
		aiProvider: "openai" as const,
		openaiApiKey: "sk-secret-value",
		openaiModel: "gpt-test",
	};
	const payload = buildOpenAiKnowledgeProposalPayload(request, settings);
	const serialized = JSON.stringify(payload);

	assert.equal(payload.endpoint, "https://api.openai.com/v1/responses");
	assert.equal(payload.model, "gpt-test");
	assert.equal(payload.response_format.type, "json_schema");
	assert.equal(serialized.includes("sk-secret-value"), false);
	assert.equal(serialized.includes("Encapsulation keeps object internals"), false);
	assert.equal(serialized.includes("Encapsulatio"), true);
}

{
	const provider = new OpenAiProvider({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: false,
		aiProvider: "openai",
		openaiApiKey: "",
	});

	await assert.rejects(
		() => provider.generateKnowledgeProposals(request),
		/OpenAI API key is required to use the OpenAI provider/,
	);
}

console.log("AI provider tests passed.");
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
