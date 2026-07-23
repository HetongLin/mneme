import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	buildConceptEnglishNameRequest,
	ConceptEnglishNameAiService,
	parseConceptEnglishNameSuggestion,
} from "../src/services/conceptEnglishNameAiService";

async function run(): Promise<void> {
{
	const request = buildConceptEnglishNameRequest({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "openai",
		openaiApiKey: "sk-secret",
		openaiModel: "gpt-test",
	}, "间隔效应", "把学习活动分散到多个时间点，以促进长期记忆。");
	const serialized = JSON.stringify(request.body);
	assert.equal(request.url, "https://api.openai.com/v1/responses");
	assert.equal(serialized.includes("sk-secret"), false);
	assert.equal(serialized.includes("isEnglishTitle"), false);
	assert.equal(serialized.includes("shortest unambiguous canonical English term"), true);
	assert.equal(serialized.includes("standard scholarly capitalization"), true);
	assert.equal(serialized.includes("use Title Case"), true);
	assert.equal(serialized.includes("k-means, p-value, t-SNE"), true);
	assert.equal(serialized.includes("Return exactly one json object"), true);
	assert.equal(serialized.includes("\\\"englishName\\\""), true);
	assert.equal(serialized.includes("间隔效应"), true);
	assert.equal(serialized.includes("把学习活动分散到多个时间点"), true);
}

{
	const request = buildConceptEnglishNameRequest({
		...DEFAULT_SETTINGS,
		aiCaptureEnabled: true,
		aiProvider: "deepseek",
		deepseekApiKey: "sk-secret",
		deepseekModel: "deepseek-test",
	}, "间隔效应", "把学习活动分散到多个时间点，以促进长期记忆。");
	const serialized = JSON.stringify(request.body);
	assert.equal(request.url, "https://api.deepseek.com/chat/completions");
	assert.equal((request.body as { response_format?: unknown }).response_format, undefined);
	assert.equal(serialized.includes("plain text on one line"), true);
	assert.equal(serialized.includes("Do not return JSON"), true);
	assert.equal(serialized.includes("standard scholarly capitalization"), true);
	assert.equal(serialized.includes("use Title Case"), true);
	assert.equal(serialized.includes("k-means, p-value, t-SNE"), true);
	assert.equal((request.body as { max_tokens?: unknown }).max_tokens, 60);
	assert.deepEqual(
		(request.body as { thinking?: unknown }).thinking,
		{ type: "disabled" },
	);
	assert.equal(serialized.includes("sk-secret"), false);
}

{
	const result = parseConceptEnglishNameSuggestion({
		englishName: "Spacing Effect",
	});
	assert.deepEqual(result, {
		englishName: "Spacing Effect",
	});
}

assert.throws(
	() => parseConceptEnglishNameSuggestion({
		englishName: "间隔效应",
	}),
	/canonical English term/,
);

{
	const service = new ConceptEnglishNameAiService({
		httpClient: {
			postJson: async () => ({
				output: [{
					content: [{
						text: JSON.stringify({
							englishName: "Dictionary Learning",
						}),
						type: "output_text",
					}],
				}],
			}),
		},
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "openai",
			openaiApiKey: "sk-secret",
		}),
	});
	assert.equal(service.isAvailable(), true);
	assert.deepEqual(await service.suggest(
		"字典学习",
		"学习字典与稀疏系数来表示输入数据。",
	), {
		englishName: "Dictionary Learning",
	});
}

{
	const service = new ConceptEnglishNameAiService({
		httpClient: {
			postJson: async () => ({
				choices: [{
					message: {
						content: "Spacing Effect",
					},
				}],
			}),
		},
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "sk-secret",
		}),
	});
	assert.deepEqual(await service.suggest(
		"间隔效应",
		"把学习活动分散到多个时间点，以促进长期记忆。",
	), {
		englishName: "Spacing Effect",
	});
}

{
	const service = new ConceptEnglishNameAiService({
		httpClient: {
			postJson: async () => ({
				choices: [{
					message: {
						content: `Here is the requested json: ${JSON.stringify({ englishName: "Dictionary Learning" })}`,
					},
				}],
			}),
		},
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "sk-secret",
		}),
	});
	assert.deepEqual(await service.suggest(
		"字典学习",
		"学习字典与稀疏系数来表示输入数据。",
	), {
		englishName: "Dictionary Learning",
	});
}

{
	const service = new ConceptEnglishNameAiService({
		httpClient: {
			postJson: async () => ({
				choices: [{
					message: {
						content: "English Name: 'Minimum Description Length'",
					},
				}],
			}),
		},
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "sk-secret",
		}),
	});
	assert.deepEqual(await service.suggest(
		"最小描述长度",
		"在模型复杂度与数据拟合之间进行权衡。",
	), {
		englishName: "Minimum Description Length",
	});
}

{
	const disabled = new ConceptEnglishNameAiService({
		settingsProvider: () => DEFAULT_SETTINGS,
	});
	assert.equal(disabled.isAvailable(), false);
	await assert.rejects(
		disabled.suggest("字典学习", "学习字典与稀疏系数来表示输入数据。"),
		/Enable AI capture/,
	);
}

{
	const service = new ConceptEnglishNameAiService({
		settingsProvider: () => ({
			...DEFAULT_SETTINGS,
			aiCaptureEnabled: true,
			aiProvider: "openai",
			openaiApiKey: "sk-secret",
		}),
	});
	await assert.rejects(
		service.suggest("字典学习", ""),
		/Core Meaning is required/,
	);
}
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
