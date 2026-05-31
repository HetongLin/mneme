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
		assert.equal(concepts[0].title, "Encapsulation");
		assert.equal(concepts[0].coreMeaning, "Encapsulation protects representation.");
		assert.equal(concepts[0].whyItMatters, "It keeps change local.");
		assert.equal(concepts[0].cardsPath, "Mneme/Cards/Encapsulation/Card.md");
		assert.equal(concepts[0].updatedAt, 200);
	}

	{
		const scanner = new ConceptScanner({
			conceptSourceLinkStore: new MemoryConceptSourceLinkReader([
				createConceptSourceLink("link-a", { conceptId: "concept-a", status: "approved" }),
				createConceptSourceLink("link-b", { conceptId: "concept-a", status: "suggested" }),
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
		const concepts = await scanner.scanConcepts();

		assert.equal(concepts[0].sourceCount, 1);
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
		const concepts = await scanner.scanConcepts();

		assert.deepEqual(concepts, []);
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
}

export const done = runAsyncTests();
