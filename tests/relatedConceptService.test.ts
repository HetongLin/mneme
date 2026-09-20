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
			[alpha.path]: conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta]]\n",
			[beta.path]: conceptMarkdown(beta),
		});
		let resolved = "Archive/Beta.md";
		vault.resolveLinkpath = () => resolved;
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareRemove(alpha, beta);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.ok(prepared.plan.writes.every((write) => write.before === write.after));
		const read = vault.read.bind(vault);
		vault.read = async (path) => {
			if (path === beta.path) resolved = beta.path;
			return read(path);
		};
		const before = { ...vault.files };
		assert.equal((await service.execute(prepared.plan)).status, "conflict", "Both no-op sides must be rechecked after all awaited reads");
		assert.deepEqual(vault.files, before);
		assert.equal(vault.modifyCount, 0);
	}

	for (const destination of ["Beta.md", "Archive/Beta.md"]) {
		const root = { ...beta, path: "Beta.md" };
		const vault = new MemoryVault({ [alpha.path]: conceptMarkdown(alpha), [root.path]: conceptMarkdown(root) });
		vault.resolveLinkpath = (link, source) => {
			assert.equal(link, "Beta");
			assert.equal(source, alpha.path);
			return destination;
		};
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareAdd(alpha, root);
		if (destination !== root.path) {
			assert.equal(prepared.status, "blocked", "A generated bare root link must resolve to the chosen target");
			assert.equal(vault.modifyCount, 0);
		} else {
			if (prepared.status !== "ready") throw new Error(prepared.message);
			assert.deepEqual(await service.execute(prepared.plan), { status: "linked" });
			assert.ok(vault.files[alpha.path]!.includes("[[Beta|Beta]]"));
		}
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta]]\n",
			[beta.path]: conceptMarkdown(beta),
		});
		let resolved = beta.path;
		vault.resolveLinkpath = () => resolved;
		const service = new RelatedConceptService(vault);
		const prepared = await service.prepareRemove(alpha, beta);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		vault.beforeProcess = () => { resolved = "Archive/Beta.md"; };
		const before = { ...vault.files };
		assert.equal((await service.execute(prepared.plan)).status, "conflict");
		assert.deepEqual(vault.files, before, "A resolution change immediately before the atomic transform must not remove the link");
		assert.equal(vault.modifyCount, 0);
	}

	for (const action of ["add", "remove"] as const) {
		for (const initialTarget of [beta.path, "Archive/Beta.md"]) {
			const vault = new MemoryVault({
				[alpha.path]: conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta|Local]]\n",
				[beta.path]: conceptMarkdown(beta),
			});
			let resolved = initialTarget;
			vault.resolveLinkpath = () => resolved;
			const service = new RelatedConceptService(vault);
			const prepared = await (action === "add" ? service.prepareAdd(alpha, beta) : service.prepareRemove(alpha, beta));
			if (prepared.status !== "ready") throw new Error(prepared.message);
			resolved = initialTarget === beta.path ? "Archive/Beta.md" : beta.path;
			const before = { ...vault.files };
			assert.equal((await service.execute(prepared.plan)).status, "conflict", "Resolution changes must invalidate even a previously unchanged side");
			assert.deepEqual(vault.files, before);
			assert.equal(vault.modifyCount, 0);
		}
	}

	for (const resolver of [undefined, () => undefined]) {
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta]]\n",
			[beta.path]: conceptMarkdown(beta),
		});
		vault.resolveLinkpath = resolver;
		const service = new RelatedConceptService(vault);
		for (const result of [await service.prepareAdd(alpha, beta), await service.prepareRemove(alpha, beta)]) {
			assert.equal(result.status, "blocked");
			if (result.status === "blocked") assert.match(result.message, /Cannot resolve Related link/);
		}
		assert.equal(vault.modifyCount, 0);
	}

	{
		const vault = new MemoryVault({
			[alpha.path]: conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta.md|Chosen Beta]]\n",
			[beta.path]: conceptMarkdown(beta),
		});
		vault.resolveLinkpath = (link, source) => {
			assert.equal(link, "Beta.md");
			assert.equal(source, alpha.path);
			return beta.path;
		};
		const service = new RelatedConceptService(vault);
		const add = await service.prepareAdd(alpha, beta);
		if (add.status !== "ready") throw new Error(add.message);
		assert.deepEqual(await service.execute(add.plan), { status: "linked" });
		assert.equal(vault.files[alpha.path]!.split("[[").length, 2, "A correctly resolved bare link prevents a duplicate");
		const remove = await service.prepareRemove(alpha, beta);
		if (remove.status !== "ready") throw new Error(remove.message);
		assert.deepEqual(await service.execute(remove.plan), { status: "unlinked" });
		assert.ok(!vault.files[alpha.path]!.includes("[[Beta.md"));
	}

	for (const action of ["add", "remove"] as const) {
		const original = conceptMarkdown(alpha) + "\n## Related Concepts\n- [[Beta|Local Beta]]\n";
		const vault = new MemoryVault({ [alpha.path]: original, [beta.path]: conceptMarkdown(beta) });
		vault.resolveLinkpath = (link, source) => {
			assert.equal(link, "Beta");
			assert.equal(source, alpha.path);
			return "Archive/Beta.md";
		};
		const service = new RelatedConceptService(vault);
		const prepared = await (action === "add" ? service.prepareAdd(alpha, beta) : service.prepareRemove(alpha, beta));
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.deepEqual(await service.execute(prepared.plan), { status: action === "add" ? "linked" : "unlinked" });
		assert.ok(vault.files[alpha.path]!.includes("[[Beta|Local Beta]]"), "Keep a bare link resolved to a different file");
		if (action === "add") assert.ok(vault.files[alpha.path]!.includes("[[Mneme/Concepts/Beta|Beta]]"), "A different resolved target must not suppress addition");
		else assert.equal(vault.files[alpha.path], original);
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
	resolveLinkpath?: (linkpath: string, sourcePath: string) => string | undefined;
	beforeProcess?: () => void;
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
		this.beforeProcess?.();
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
