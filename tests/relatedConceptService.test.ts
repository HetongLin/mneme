import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import {
	RelatedConceptService,
	type RelatedConceptVaultAdapter,
} from "../src/services/relatedConceptService";

const alpha = createConcept("concept-alpha", "Alpha", "Mneme/Concepts/Alpha.md");
const beta = createConcept("concept-beta", "Beta", "Mneme/Concepts/Beta.md");

async function runAsyncTests(): Promise<void> {
	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha),
			[beta.path]: conceptMarkdown(beta),
		});
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, beta);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.deepEqual(await service.execute(prepared.plan), { status: "linked" });
		assert.match(vault.files[alpha.path] ?? "", /\[\[Mneme\/Concepts\/Beta\|Beta\]\]/);
		assert.match(vault.files[beta.path] ?? "", /\[\[Mneme\/Concepts\/Alpha\|Alpha\]\]/);

		const removal = await service.prepareRemove(alpha, beta);
		assert.equal(removal.status, "ready");
		if (removal.status !== "ready") throw new Error(removal.message);
		assert.deepEqual(await service.execute(removal.plan), { status: "unlinked" });
		assert.doesNotMatch(vault.files[alpha.path] ?? "", /Related Concepts/);
		assert.doesNotMatch(vault.files[beta.path] ?? "", /Related Concepts/);
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha),
			[beta.path]: conceptMarkdown(beta),
		});
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, beta);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		vault.files[beta.path] += "Concurrent edit\n";

		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "conflict");
		assert.doesNotMatch(vault.files[alpha.path] ?? "", /Related Concepts/);
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha),
			[beta.path]: conceptMarkdown(beta),
		});
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, beta);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		vault.racePath = alpha.path;
		vault.raceEdit = "\nEdit made after the initial check\n";

		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "conflict");
		assert.match(vault.files[alpha.path] ?? "", /Edit made after the initial check/);
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha),
			[beta.path]: conceptMarkdown(beta),
		});
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, beta);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		vault.failOnPath = beta.path;

		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.equal(vault.files[alpha.path], conceptMarkdown(alpha));
		assert.equal(vault.files[beta.path], conceptMarkdown(beta));
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha),
			[beta.path]: conceptMarkdown(beta),
		});
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, beta);
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		vault.failOnPath = beta.path;
		vault.rollbackRace = true;

		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.match(vault.files[alpha.path] ?? "", /\[\[Mneme\/Concepts\/Beta\|Beta\]\]/);
		assert.match(vault.files[alpha.path] ?? "", /Edit made during rollback/);
		assert.equal(vault.files[beta.path], conceptMarkdown(beta));
	}
}

class MemoryVault implements RelatedConceptVaultAdapter {
	failOnPath?: string;
	modifyCount = 0;
	racePath?: string;
	raceEdit?: string;
	rollbackRace = false;

	constructor(public files: Record<string, string>) {
	}

	async read(path: string): Promise<string> {
		const markdown = this.files[path];
		if (markdown === undefined) throw new Error(`Missing ${path}`);
		return markdown;
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		if (this.failOnPath === path) {
			this.failOnPath = undefined;
			throw new Error("Write failed");
		}
		if (this.rollbackRace && this.modifyCount > 0) {
			this.rollbackRace = false;
			this.files[path] += "\nEdit made during rollback\n";
		}
		if (this.racePath === path && this.raceEdit) {
			this.files[path] += this.raceEdit;
			this.racePath = undefined;
			this.raceEdit = undefined;
		}
		const current = this.files[path];
		if (current === undefined) throw new Error(`Missing ${path}`);
		const next = transform(current);
		this.files[path] = next;
		this.modifyCount += 1;
	}
}

function createConcept(conceptId: string, title: string, path: string): ConceptSummary {
	return { conceptId, coreMeaning: `${title} core`, path, title };
}

function conceptMarkdown(concept: ConceptSummary): string {
	return [
		"---",
		"mneme_type: concept",
		`mneme_id: ${concept.conceptId}`,
		"---",
		`# ${concept.title}`,
		"",
		"## Core Meaning",
		"",
		concept.coreMeaning,
		"",
	].join("\n");
}

void runAsyncTests().then(() => {
	console.log("Related Concept Service tests passed.");
});
