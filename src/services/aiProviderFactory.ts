import type { MnemeSettings } from "../models/settings";
import type { AiProvider } from "./aiProvider";
import { DeepSeekProvider } from "./deepSeekProvider";
import { MockAiProvider } from "./mockAiProvider";
import { OpenAiProvider } from "./openAiProvider";

export function createAiProvider(settings: MnemeSettings): AiProvider {
	switch (settings.aiProvider) {
		case "deepseek":
			return new DeepSeekProvider(settings);
		case "openai":
			return new OpenAiProvider(settings);
		case "mock":
		default:
			return new MockAiProvider(settings);
	}
}
