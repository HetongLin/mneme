import type {
	ConceptSourceLinkDraft,
	ConceptViewDraft,
	ProposalLearningMode,
	SuggestedImportance,
} from "../models/knowledgeProposal";
import { toObsidianInternalLink } from "../utils/markdownPath";
import { normalizeConceptNames } from "./conceptNaming";

export interface RenderConceptMarkdownInput {
	cardGroupLink: string;
	conceptId: string;
	coreMeaning: string;
	englishName?: string;
	importance?: SuggestedImportance;
	learningMode?: ProposalLearningMode;
	sourceLinks?: ConceptSourceLinkDraft[];
	sourcePath?: string;
	tags?: string[];
	title: string;
	views?: ConceptViewDraft[];
	whyItMatters?: string;
}

export function renderConceptMarkdown(input: RenderConceptMarkdownInput): string {
	const tags = normalizeConceptTags(input.tags ?? []);
	const names = normalizeConceptNames(input.title, input.englishName);
	const lines = [
		"---",
		"mneme_type: concept",
		`mneme_id: ${input.conceptId}`,
		`mneme_title: "${escapeYamlDoubleQuoted(names.title)}"`,
		`mneme_english_name: "${escapeYamlDoubleQuoted(names.englishName)}"`,
		"mneme_version: 1",
		`cards: "${escapeYamlDoubleQuoted(input.cardGroupLink)}"`,
		...(input.learningMode ? [`learning_mode: ${input.learningMode}`] : []),
		...(input.importance ? [`importance: ${input.importance}`] : []),
		...(tags.length > 0 ? [`tags: [${tags.join(", ")}]`] : []),
		"---",
		"",
		`# ${names.displayTitle}`,
	];
	const coreMeaning = input.coreMeaning.trim();
	const whyItMatters = input.whyItMatters?.trim();
	if (coreMeaning) {
		lines.push("", "## Core Meaning", "", coreMeaning);
	}
	if (whyItMatters && whyItMatters !== coreMeaning) {
		lines.push("", "## Why It Matters", "", whyItMatters);
	}
	const views = (input.views ?? []).filter((view) => view.title.trim() && view.body.trim());
	if (views.length > 0) {
		lines.push("", "## Views", "");
		for (const view of views) {
			lines.push(`### ${view.title.trim()}`, "", view.body.trim(), "");
		}
	}

	lines.push("", "## Review Cards", "", `Cards: ${input.cardGroupLink}`);

	const sourceLinks = input.sourceLinks ?? [];
	if (sourceLinks.length > 0 || input.sourcePath) {
		lines.push("", "## Source Notes", "", "> [!info]- Source Notes");
		if (sourceLinks.length > 0) {
			for (const link of sourceLinks) {
				lines.push(`> - ${toObsidianInternalLink(link.sourcePath)}`);
				lines.push(`>   - relation: ${link.relationType}`);
				const excerpt = link.evidence?.[0]?.excerpt;
				if (excerpt) {
					lines.push(`>   - evidence: ${truncateSingleLine(excerpt, 180)}`);
				}
			}
		} else if (input.sourcePath) {
			lines.push(`> - ${toObsidianInternalLink(input.sourcePath)}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

export function normalizeConceptTags(value: string[]): string[] {
	const tags = value
		.map((tag) => tag
			.trim()
			.replace(/^#+/, "")
			.replace(/^['"]|['"]$/g, "")
			.trim()
			.toLocaleLowerCase()
			.replace(/[^\p{L}\p{N}/_-]+/gu, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, ""))
		.filter(Boolean);

	return [...new Set(tags)].slice(0, 20);
}

function truncateSingleLine(value: string, maxLength: number): string {
	const normalized = value.replace(/\s+/g, " ").trim();

	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function escapeYamlDoubleQuoted(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
