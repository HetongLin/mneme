import type { ConceptSummary } from "../models/conceptLibrary";

export interface KnowledgeContextPackConcept {
	markdown: string;
	summary: ConceptSummary;
}

export interface KnowledgeContextPackOptions {
	generatedAt?: string;
	title?: string;
}

export interface KnowledgeContextPack {
	conceptCount: number;
	files: Record<string, string>;
	generatedAt: string;
	title: string;
}

export function createKnowledgeContextPack(
	concepts: KnowledgeContextPackConcept[],
	options: KnowledgeContextPackOptions = {},
): KnowledgeContextPack {
	const generatedAt = options.generatedAt ?? new Date().toISOString();
	const title = options.title?.trim() || "Mneme Knowledge Context Pack";
	const sortedConcepts = [...concepts].sort(comparePackConcepts);
	const conceptFiles = createConceptFiles(sortedConcepts);
	const files: Record<string, string> = {
		"README.md": renderReadme(title, generatedAt, sortedConcepts.length),
		"concepts/index.md": renderConceptIndex(sortedConcepts, conceptFiles),
	};

	for (const file of conceptFiles) {
		files[file.path] = file.markdown;
	}

	return {
		conceptCount: sortedConcepts.length,
		files,
		generatedAt,
		title,
	};
}

interface ConceptPackFile {
	concept: KnowledgeContextPackConcept;
	markdown: string;
	path: string;
}

function createConceptFiles(concepts: KnowledgeContextPackConcept[]): ConceptPackFile[] {
	const usedNames = new Set<string>();

	return concepts.map((concept) => {
		const baseName = sanitizeFilename(concept.summary.title || concept.summary.conceptId);
		const fileName = reserveUniqueFilename(baseName, usedNames);

		return {
			concept,
			markdown: cleanConceptMarkdownForContextPack(concept.markdown),
			path: `concepts/${fileName}.md`,
		};
	});
}

function renderReadme(title: string, generatedAt: string, conceptCount: number): string {
	return [
		`# ${title}`,
		"",
		`Generated at: ${generatedAt}`,
		`Concepts included: ${conceptCount}`,
		"",
		"This pack tells an external agent which Mneme Concepts the student has read and approved.",
		"Approved does not mean mastered; this pack is not a mastery claim.",
		"",
		"This pack is intentionally neutral. The student should add project goals, time budget, difficulty, course context, and constraints in the later conversation with the agent.",
		"",
		"Excluded by design:",
		"",
		"- Source Notes",
		"- Cards",
		"- FSRS scheduler state",
		"- Review history",
		"- Credentials",
		"- Developer diagnostics",
		"- A prescriptive project request",
		"",
		"Start with `concepts/index.md`, then read the selected Concept files.",
		"",
	].join("\n");
}

function renderConceptIndex(concepts: KnowledgeContextPackConcept[], files: ConceptPackFile[]): string {
	const lines = [
		"# Concept Index",
		"",
		"These Concepts are approved Mneme learning notes, not a mastery claim.",
		"",
	];

	for (const file of files) {
		const concept = file.concept.summary;
		lines.push(`## ${concept.title}`);
		lines.push("");
		lines.push(`- Concept ID: \`${concept.conceptId}\``);
		lines.push(`- Concept file: [${file.path.replace(/^concepts\//, "")}](./${file.path.replace(/^concepts\//, "")})`);
		lines.push(`- Original path: \`${concept.path}\``);
		lines.push(`- Learning mode: ${concept.learningMode ?? "reviewable"}`);
		lines.push(`- Importance: ${concept.importance ?? "normal"}`);
		if (concept.coreMeaning) {
			lines.push(`- Core meaning: ${concept.coreMeaning}`);
		}
		if (concept.whyItMatters) {
			lines.push(`- Why it matters: ${concept.whyItMatters}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

function comparePackConcepts(first: KnowledgeContextPackConcept, second: KnowledgeContextPackConcept): number {
	return first.summary.title.localeCompare(second.summary.title, undefined, { sensitivity: "base" })
		|| first.summary.conceptId.localeCompare(second.summary.conceptId);
}

function reserveUniqueFilename(baseName: string, usedNames: Set<string>): string {
	let candidate = baseName;
	let suffix = 2;

	while (usedNames.has(candidate.toLowerCase())) {
		candidate = `${baseName}-${suffix}`;
		suffix += 1;
	}

	usedNames.add(candidate.toLowerCase());
	return candidate;
}

function sanitizeFilename(value: string): string {
	const sanitized = value
		.trim()
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return sanitized || "concept";
}

function cleanConceptMarkdownForContextPack(markdown: string): string {
	const lines = markdown.split(/\r?\n/);
	const keptLines: string[] = [];
	let isSkippingSection = false;

	for (const line of lines) {
		const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);

		if (heading) {
			const level = heading[1]?.length ?? 0;
			const title = (heading[2] ?? "").trim().toLowerCase();

			if (level === 2 && (title === "source notes" || title === "review cards")) {
				isSkippingSection = true;
				continue;
			}

			if (level <= 2) {
				isSkippingSection = false;
			}
		}

		if (!isSkippingSection) {
			keptLines.push(line);
		}
	}

	return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
