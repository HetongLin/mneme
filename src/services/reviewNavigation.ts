import { extractSection } from "./conceptMarkdownParser";

export interface ReviewCompletionSummary {
	deferredCount: number;
	deletedCount: number;
	label: string;
	reviewedCount: number;
	skippedCount: number;
	suspendedCount: number;
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

export function formatReviewCompletion(
	totalCards: number,
	skippedCards: number,
	deferredCards = 0,
	suspendedCards = 0,
	deletedCards = 0,
): ReviewCompletionSummary {
	const total = Math.max(0, Math.floor(totalCards));
	const skippedCount = Math.min(total, Math.max(0, Math.floor(skippedCards)));
	const deferredCount = Math.min(
		total - skippedCount,
		Math.max(0, Math.floor(deferredCards)),
	);
	const suspendedCount = Math.min(
		total - skippedCount - deferredCount,
		Math.max(0, Math.floor(suspendedCards)),
	);
	const deletedCount = Math.min(
		total - skippedCount - deferredCount - suspendedCount,
		Math.max(0, Math.floor(deletedCards)),
	);
	const reviewedCount = total - skippedCount - deferredCount - suspendedCount - deletedCount;
	const label = skippedCount === 0 && deferredCount === 0 && suspendedCount === 0 && deletedCount === 0
		? `${reviewedCount} ${reviewedCount === 1 ? "card" : "cards"} reviewed`
		: [
			`${reviewedCount} reviewed`,
			skippedCount > 0 ? `${skippedCount} skipped` : undefined,
			deferredCount > 0 ? `${deferredCount} later` : undefined,
			suspendedCount > 0 ? `${suspendedCount} suspended` : undefined,
			deletedCount > 0 ? `${deletedCount} deleted` : undefined,
		].filter((part): part is string => Boolean(part)).join(" · ");

	return { deferredCount, deletedCount, label, reviewedCount, skippedCount, suspendedCount };
}
