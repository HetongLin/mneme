export type ResolveCardLink = (linkpath: string, sourcePath: string) => string | undefined;

interface RelocatingCard {
	cardId: string;
	raw: string;
}

/** Conservative preflight, not a Markdown parser. Even syntax in examples is checked. */
export function assertCardRelocationSafe(
	cards: readonly RelocatingCard[],
	source: { path: string; markdown: string },
	target: { path: string; markdown: string },
	resolveLink?: ResolveCardLink,
): void {
	if (source.path === target.path) return;
	const definitions = new Set<string>();
	for (const markdown of [source.markdown, target.markdown]) {
		for (const match of markdown.matchAll(/\[([^\]]+)\]:/g)) {
			definitions.add(normalizeLabel(match[1] ?? ""));
		}
	}
	for (const card of cards) {
		const reject = (reason: string): never => {
			throw new Error(`Card ${card.cardId} cannot move from ${source.path} to ${target.path}: ${reason}. Review its references before merging.`);
		};
		const withoutWikiLinks = card.raw.replace(/\[\[([^\]]*)\]\]/g, (_match, text: string) => {
			const linkpath = (text.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
			if (!linkpath || /[\\\r\n]/.test(linkpath)) reject("a Wiki link depends on its current file");
			const fromSource = resolveLink?.(linkpath, source.path);
			const fromTarget = resolveLink?.(linkpath, target.path);
			if (!fromSource || fromSource !== fromTarget || fromSource === source.path) {
				reject("a Wiki link has an unresolved or changing target");
			}
			return "";
		});
		// Starting at the closing bracket also catches images and nested link labels.
		for (const match of withoutWikiLinks.matchAll(/\]\s*\(\s*<?([^\s<>)]*)/g)) {
			if (!/^(?:https?:\/\/|mailto:|tel:|data:)/i.test(match[1] ?? "")) {
				reject("a Markdown link or attachment depends on its current location");
			}
		}
		if (/\]\s*\[|\[\^|\^\[|\[[^\]]+\]:/.test(withoutWikiLinks)) {
			reject("reference links or footnotes depend on document definitions");
		}
		for (const match of withoutWikiLinks.matchAll(/\[([^\[\]]+)\](?!\s*\()/g)) {
			if (definitions.has(normalizeLabel(match[1] ?? ""))) {
				reject("a shortcut reference depends on document definitions");
			}
		}
		if (/<[^>]*\b(?:href|src|srcset)\s*=/i.test(withoutWikiLinks)) {
			reject("HTML resource references require a manual relocation review");
		}
	}
}

function normalizeLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}
