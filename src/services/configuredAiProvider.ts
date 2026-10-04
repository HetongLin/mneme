import type { MnemeSettings } from "../models/settings";
import { getAiProviderConnection, snapshotAiSettings } from "../models/aiProviderCatalog";
import type { AiJsonHttpClient, AiProposalRequest, AiProposalResponse, AiProvider } from "./aiProvider";
import { toLogSafeAiConfig, validateAiProviderConfig } from "./aiProvider";
import { buildAiJsonRequest, parseAiJsonResponse } from "./aiJsonProtocol";
import { buildOpenAiKnowledgeProposalPayload } from "./openAiProvider";

export class ConfiguredAiProvider implements AiProvider {
	constructor(private readonly settings: MnemeSettings, private readonly httpClient?: AiJsonHttpClient) {}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		const settings = snapshotAiSettings(this.settings);
		const validation = validateAiProviderConfig(settings);
		if (!validation.valid) throw new Error(validation.errors.join(" "));
		if (!this.httpClient) throw new Error("AI network transport is not configured.");
		// Reuse the existing grounded prompts and schemas for every provider.
		const template = buildOpenAiKnowledgeProposalPayload(input, settings);
		const system = template.input?.[0]?.content;
		const user = template.input?.[1]?.content;
		const format = template.text?.format;
		if (!system || !user || !format) throw new Error("The proposal request template is incomplete.");
		const request = buildAiJsonRequest(settings, { systemPrompt: system, userContent: user, schema: format.schema, schemaName: format.name });
		const raw = await this.httpClient.postJson(request);
		const config = getAiProviderConnection(settings);
		return {
			diagnostics: { inputChars: input.sourceContent.length, logSafeConfig: toLogSafeAiConfig(settings), warnings: [] },
			provider: {
				baseUrl: config.baseUrl, model: config.model, provider: config.name,
				structuredOutput: config.protocol !== "chat_completions" ? "json_schema" : config.jsonMode ? "json_object" : "prompt_json",
			},
			structuredResponse: parseAiJsonResponse(settings, raw),
		};
	}
}
