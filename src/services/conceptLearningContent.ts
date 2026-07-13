import { extractSection, parseConceptTitle } from "./conceptMarkdownParser";

const ASSESSABLE_SECTIONS = [
	"Core Meaning",
	"Why It Matters",
	"Views",
	"Common Traps",
	"Related Concepts",
] as const;

export function extractConceptLearningContent(markdown: string, fallbackPath = "Concept.md"): string {
	const lines = [`# ${parseConceptTitle(markdown, fallbackPath)}`];

	for (const heading of ASSESSABLE_SECTIONS) {
		const content = extractSection(markdown, heading)?.trim();
		if (content) {
			lines.push(`## ${heading}`, content);
		}
	}

	return `${lines.join("\n\n").trim()}\n`;
}
