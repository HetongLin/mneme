export function normalizeSourceContentForHash(content: string): string {
	return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function computeContentHash(content: string): Promise<string> {
	const normalizedContent = normalizeSourceContentForHash(content);
	const bytes = new TextEncoder().encode(normalizedContent);
	const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);

	return Array.from(new Uint8Array(hashBuffer))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
