import type { MnemeSettings } from "../models/settings";
import type { AiJsonHttpClient, AiProvider } from "./aiProvider";
import { DeepSeekProvider } from "./deepSeekProvider";
import { MockAiProvider } from "./mockAiProvider";
import { OpenAiProvider } from "./openAiProvider";

export function createAiProvider(settings: MnemeSettings, httpClient?: AiJsonHttpClient): AiProvider {
	switch (settings.aiProvider) {
		case "deepseek":
			return new DeepSeekProvider(settings, httpClient);
		case "openai":
			return new OpenAiProvider(settings, httpClient);
		case "mock":
		default:
			return new MockAiProvider(settings);
	}
}
