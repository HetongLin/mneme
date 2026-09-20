import { assertMarkdownRelocationSafe, type ResolveMarkdownLink } from "./markdownRelocationSafety";

export type ResolveCardLink = ResolveMarkdownLink;

export function assertCardRelocationSafe(
	cards: readonly { cardId: string; raw: string }[],
	source: { path: string; markdown: string },
	target: { path: string; markdown: string },
	resolveLink?: ResolveCardLink,
): void {
	assertMarkdownRelocationSafe(
		cards.map((card) => ({ label: `Card ${card.cardId}`, raw: card.raw })),
		source,
		target,
		resolveLink,
	);
}
