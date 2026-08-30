import assert from "node:assert/strict";
import type { ConceptSourceLink } from "../src/models/conceptSource";
import { ConceptScanner, type ConceptVaultAdapter } from "../src/services/conceptScanner";
import { createConceptSourceLink } from "./knowledgeProposalTestUtils";

class MemoryConceptVaultAdapter implements ConceptVaultAdapter {
	constructor(
		private readonly files: Record<string, {
			frontmatter?: unknown;
			markdown: string;
			mtime?: number;
		}>,
	) {
	}

	async listMarkdownFiles() {
		return Object.entries(this.files).map(([path, file]) => ({
			mtime: file.mtime,
			path,
		}));
	}

	async getFrontmatter(path: string): Promise<unknown | undefined> {
		return this.files[path]?.frontmatter;
	}

	async readMarkdown(path: string): Promise<string> {
		return this.files[path]?.markdown ?? "";
	}
}

class MemoryConceptSourceLinkReader {
	constructor(private readonly links: ConceptSourceLink[]) {
	}

	async listByConceptId(conceptId: string): Promise<ConceptSourceLink[]> {
		return this.links.filter((link) => link.conceptId === conceptId);
	}
}

async function runAsyncTests(): Promise<void> {
	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/Encapsulation/Concept.md": {
					frontmatter: {
						cards: "[[Mneme/Cards/Encapsulation/Card|Encapsulation Cards]]",
						importance: "high",
						learning_mode: "reviewable",
						mneme_id: "concept-encapsulation",
						mneme_type: "concept",
						retention_target: 0.94,
						tags: ["oop", "design"],
					},
					markdown: [
						"# Encapsulation",
						"",
						"## Core Meaning",
						"",
						"Encapsulation protects representation.",
						"",
						"## Why It Matters",
						"",
						"It keeps change local.",
					].join("\n"),
					mtime: 200,
				},
				"Notes/Regular.md": {
					frontmatter: {
						title: "Regular note",
					},
					markdown: "# Regular",
					mtime: 300,
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.equal(concepts.length, 1);
		assert.equal(concepts[0].conceptId, "concept-encapsulation");
		assert.equal(concepts[0].learningMode, "reviewable");
		assert.equal(concepts[0].importance, "high");
		assert.equal(concepts[0].retentionTarget, 0.94);
		assert.equal(concepts[0].title, "Encapsulation");
		assert.equal(concepts[0].coreMeaning, "Encapsulation protects representation.");
		assert.equal(concepts[0].whyItMatters, "It keeps change local.");
		assert.equal(concepts[0].cardsPath, "Mneme/Cards/Encapsulation/Card.md");
		assert.deepEqual(concepts[0].tags, ["oop", "design"]);
		assert.equal(concepts[0].updatedAt, 200);
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/Freshly-Written.md": {
					markdown: [
						"---",
						"mneme_type: concept",
						"mneme_id: concept-freshly-written",
						"mneme_title: \"Freshly Written\"",
						"learning_mode: reviewable",
						"importance: normal",
						"tags: [mneme, acceptance-test]",
						"---",
						"",
						"# Freshly Written",
						"",
						"## Core Meaning",
						"",
						"This Concept is visible before Obsidian's metadata cache catches up.",
					].join("\n"),
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.equal(concepts.length, 1);
		assert.equal(concepts[0].conceptId, "concept-freshly-written");
		assert.equal(concepts[0].title, "Freshly Written");
		assert.deepEqual(concepts[0].tags, ["mneme", "acceptance-test"]);
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/Bayes-Theorem.md": {
					frontmatter: {
						cards_folder: "Mneme/Cards/Bayes-Theorem",
						mneme_id: "concept-bayes-theorem",
						mneme_type: "concept",
					},
					markdown: "# Bayes Theorem",
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.equal(concepts[0].cardsPath, "Mneme/Cards/Bayes-Theorem");
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/Spacing-Effect.md": {
					frontmatter: {
						cards: "[[Mneme/Cards/Spacing-Effect/Cards|Spacing Effect Cards]]",
						mneme_id: "concept-spacing-effect",
						mneme_type: "concept",
					},
					markdown: "# Spacing Effect",
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.equal(concepts[0].cardsPath, "Mneme/Cards/Spacing-Effect/Cards.md");
	}

	{
		const scanner = new ConceptScanner({
			conceptSourceLinkStore: new MemoryConceptSourceLinkReader([
				createConceptSourceLink("link-a", { conceptId: "concept-a", status: "approved" }),
				createConceptSourceLink("link-b", { conceptId: "concept-a", status: "suggested" }),
				createConceptSourceLink("link-c", { conceptId: "concept-a", sourcePath: "Missing.md", status: "stale" }),
			]),
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/A/Concept.md": {
					frontmatter: {
						mneme_id: "concept-a",
						mneme_type: "concept",
					},
					markdown: "# A",
				},
			}),
		});
		const result = await scanner.scan();
		const concepts = result.concepts;

		assert.equal(concepts[0].sourceCount, 1);
		assert.equal(result.staleSourceIssues.length, 1);
		assert.equal(result.staleSourceIssues[0].link.sourcePath, "Missing.md");
		assert.equal(result.staleSourceIssues[0].conceptTitle, "A");
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/B/Concept.md": {
					frontmatter: {
						mneme_type: "concept",
					},
					markdown: "# B",
				},
				"Mneme/Concepts/C/Concept.md": {
					frontmatter: "malformed",
					markdown: "# C",
				},
			}),
		});
		const result = await scanner.scan();

		assert.deepEqual(result.concepts, []);
		assert.equal(result.identityIssues.length, 1);
		assert.equal(result.identityIssues[0].kind, "missing_id");
		assert.equal(result.identityIssues[0].path, "Mneme/Concepts/B/Concept.md");
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/A/Concept.md": {
					frontmatter: {
						cards: "[[Mneme/Cards/A/Card]]",
						mneme_id: "concept-duplicate",
						mneme_type: "concept",
					},
					markdown: "# Alpha",
				},
				"Mneme/Concepts/B/Concept.md": {
					frontmatter: {
						mneme_id: "concept-duplicate",
						mneme_type: "concept",
					},
					markdown: "# Beta",
				},
			}),
		});
		const result = await scanner.scan();

		assert.deepEqual(result.concepts, []);
		assert.deepEqual(result.identityIssues.map((issue) => issue.kind), ["duplicate_id", "duplicate_id"]);
		assert.equal(result.identityIssues[0].cardsPath, "Mneme/Cards/A/Card.md");
		assert.equal(result.identityIssues[1].conceptId, "concept-duplicate");
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/B/Concept.md": {
					frontmatter: {
						mneme_id: "concept-b",
						mneme_type: "concept",
					},
					markdown: "# Beta",
				},
				"Mneme/Concepts/A/Concept.md": {
					frontmatter: {
						mneme_id: "concept-a",
						mneme_type: "concept",
					},
					markdown: "# Alpha",
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.deepEqual(concepts.map((concept) => concept.title), ["Alpha", "Beta"]);
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/A.md": {
					frontmatter: { mneme_id: "concept-a", mneme_type: "concept" },
					markdown: "# Alpha\n\n## Related Concepts\n\n- [[Mneme/Concepts/B|Beta]]\n",
				},
				"Mneme/Concepts/B.md": {
					frontmatter: { mneme_id: "concept-b", mneme_type: "concept" },
					markdown: "# Beta",
				},
			}),
		});
		const concepts = await scanner.scanConcepts();

		assert.deepEqual(concepts.find((concept) => concept.conceptId === "concept-a")?.relatedConceptIds, ["concept-b"]);
		assert.deepEqual(concepts.find((concept) => concept.conceptId === "concept-b")?.relatedConceptIds, ["concept-a"]);
	}

	{
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter({
				"Mneme/Concepts/A/Concept.md": {
					frontmatter: { mneme_id: "concept-a", mneme_type: "concept" },
					markdown: "# Information Gain\n\n## Core Meaning\n\nEntropy reduction after a split.",
				},
				"Mneme/Concepts/B/Concept.md": {
					frontmatter: { mneme_id: "concept-b", mneme_type: "concept" },
					markdown: "# information-gain\n\n## Core Meaning\n\nAnother explanation.",
				},
			}),
		});
		const result = await scanner.scan();

		assert.equal(result.duplicateCandidates.length, 1);
		assert.equal(result.duplicateCandidates[0]?.pairKey, '["concept-a","concept-b"]');
	}

	{
		const files: Record<string, {
			frontmatter?: unknown;
			markdown: string;
			mtime?: number;
		}> = {
			"Mneme/Concepts/Deleted/Concept.md": {
				frontmatter: {
					mneme_id: "concept-deleted",
					mneme_type: "concept",
				},
				markdown: "# Deleted",
			},
			"Mneme/Concepts/Kept/Concept.md": {
				frontmatter: {
					mneme_id: "concept-kept",
					mneme_type: "concept",
				},
				markdown: "# Kept",
			},
		};
		const scanner = new ConceptScanner({
			vault: new MemoryConceptVaultAdapter(files),
		});

		assert.deepEqual((await scanner.scanConcepts()).map((concept) => concept.conceptId).sort(), [
			"concept-deleted",
			"concept-kept",
		]);

		delete files["Mneme/Concepts/Deleted/Concept.md"];

		assert.deepEqual((await scanner.scanConcepts()).map((concept) => concept.conceptId), [
			"concept-kept",
		]);
	}
}

export const done = runAsyncTests();
