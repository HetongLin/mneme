import { extractSection } from "./conceptMarkdownParser";

export interface ReviewCompletionSummary {
	label: string;
	reviewedCount: number;
	skippedCount: number;
}

export function extractFirstConceptSourcePath(markdown: string): string | undefined {
	const sourceSection = extractSection(markdown, "Source Notes");

	if (!sourceSection) {
		return undefined;
	}

	const rawLink = sourceSection.match(/\[\[[^\]]+\]\]/)?.[0];
	const link = rawLink ? parseObsidianLinkPath(rawLink) : undefined;

	return link || undefined;
}

export function parseObsidianLinkPath(value: string): string | undefined {
	const trimmed = value.trim();
	const internalLink = trimmed.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/)?.[1] ?? trimmed;
	const path = internalLink.split("#", 1)[0]?.trim();

	return path || undefined;
}

export function formatReviewCompletion(totalCards: number, skippedCards: number): ReviewCompletionSummary {
	const total = Math.max(0, Math.floor(totalCards));
	const skippedCount = Math.min(total, Math.max(0, Math.floor(skippedCards)));
	const reviewedCount = total - skippedCount;
	const label = skippedCount === 0
		? `${reviewedCount} ${reviewedCount === 1 ? "card" : "cards"} reviewed`
		: `${reviewedCount} reviewed · ${skippedCount} skipped`;

	return { label, reviewedCount, skippedCount };
}
