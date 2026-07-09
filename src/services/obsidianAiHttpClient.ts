import { requestUrl } from "obsidian";
import type { AiJsonHttpClient, AiJsonHttpRequest } from "./aiProvider";

export class ObsidianAiHttpClient implements AiJsonHttpClient {
	async postJson(input: AiJsonHttpRequest): Promise<unknown> {
		const request = requestUrl({
			body: JSON.stringify(input.body),
			contentType: "application/json",
			headers: input.headers,
			method: "POST",
			url: input.url,
		});

		return withTimeout(request.then((response) => response.json), input.timeoutMs);
	}
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error(formatTimeoutMessage(timeoutMs))),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	}
}

function formatTimeoutMessage(timeoutMs: number): string {
	const seconds = Math.round(timeoutMs / 1000);

	return `AI request timed out after ${seconds} seconds. Increase Mneme Settings → Request timeout, or try a shorter Source Note.`;
}
