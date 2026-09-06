import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { SourceProvenanceRemovalService } from "../src/services/sourceProvenanceRemovalService";
import { createConceptSourceLink, createPluginData, createSourceRecord } from "./knowledgeProposalTestUtils";

const conceptPath = "Mneme/Concepts/A/Concept.md";
const sourcePath = "Notes/Missing.md";
const markdown = "---\nmneme_type: concept\nmneme_id: concept-a\n---\n# A\n\n## Source Notes\n\n> - [[Notes/Missing]]\n>   - relation: origin\n>   - evidence: evidence\n";
const link = createConceptSourceLink("stale", { conceptId: "concept-a", evidence: [{ excerpt: "evidence" }], sourcePath, status: "stale" });
const issue = { conceptId: "concept-a", conceptPath, conceptTitle: "A", link };

class Vault {
	content = markdown;
	beforeProcess?: () => void;
	async read() { return this.content; }
	async process(_path: string, transform: (current: string) => string) {
		this.beforeProcess?.();
		this.beforeProcess = undefined;
		this.content = transform(this.content);
	}
}

class Storage {
	saves = 0;
	failOnce = false;
	onFailure?: () => void;
	constructor(public data: MnemePluginData) {}
	async loadData() { return this.data; }
	async saveData(data: MnemePluginData) {
		this.saves += 1;
		this.data = data;
		if (this.failOnce) { this.failOnce = false; this.onFailure?.(); throw new Error("save failed"); }
	}
}

function data(extra = {}) {
	return createPluginData({}, {
		[sourcePath]: { ...createSourceRecord(sourcePath), linkedConceptIds: ["concept-a", "concept-b"] },
	}, { [link.id]: link, ...extra });
}

async function run() {
	{
		const vault = new Vault();
		const storage = new Storage(data());
		const service = new SourceProvenanceRemovalService(vault, storage);
		const prepared = await service.prepare(issue);
		assert.equal(prepared.status, "ready");
		assert.equal(storage.saves, 0);
		assert.doesNotMatch(prepared.plan.conceptAfter, /Notes\/Missing/);
		assert.deepEqual(prepared.plan.nextData.sourceAnalysisRecords[sourcePath].linkedConceptIds, ["concept-b"]);
		assert.deepEqual(await service.execute(prepared.plan), { status: "removed" });
		assert.equal(storage.data.conceptSourceLinks[link.id], undefined);
	}

	{
		const other = createConceptSourceLink("other", { conceptId: "concept-a", relationType: "supporting", sourcePath, status: "stale" });
		const vault = new Vault();
		const prepared = await new SourceProvenanceRemovalService(vault, new Storage(data({ [other.id]: other }))).prepare(issue);
		assert.equal(prepared.status, "ready");
		assert.equal(prepared.plan.readableEntryPreserved, true);
		assert.equal(prepared.plan.conceptAfter, markdown);
		assert.deepEqual(prepared.plan.nextData.sourceAnalysisRecords[sourcePath].linkedConceptIds, ["concept-a", "concept-b"]);
	}

	{
		const vault = new Vault();
		const storage = new Storage(data());
		const service = new SourceProvenanceRemovalService(vault, storage);
		const prepared = await service.prepare(issue);
		assert.equal(prepared.status, "ready");
		vault.content += "changed";
		assert.equal((await service.execute(prepared.plan)).status, "conflict");
	}

	{
		const vault = new Vault();
		const storage = new Storage(data());
		const service = new SourceProvenanceRemovalService(vault, storage);
		const prepared = await service.prepare(issue);
		assert.equal(prepared.status, "ready");
		vault.beforeProcess = () => { vault.content += "changed before process"; };
		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "conflict");
		assert.match(vault.content, /changed before process/);
		assert.equal(storage.saves, 0);
	}

	{
		const vault = new Vault();
		const storage = new Storage(data());
		const service = new SourceProvenanceRemovalService(vault, storage);
		const prepared = await service.prepare(issue);
		assert.equal(prepared.status, "ready");
		storage.failOnce = true;
		assert.equal((await service.execute(prepared.plan)).status, "failed");
		assert.equal(vault.content, markdown);
		assert.ok(storage.data.conceptSourceLinks[link.id]);
	}

	{
		const vault = new Vault();
		const storage = new Storage(data());
		const service = new SourceProvenanceRemovalService(vault, storage);
		const prepared = await service.prepare(issue);
		assert.equal(prepared.status, "ready");
		storage.failOnce = true;
		storage.onFailure = () => { vault.content += "user edit during rollback"; };
		const result = await service.execute(prepared.plan);
		assert.equal(result.status, "failed");
		assert.match(result.message, /Rollback also failed/);
		assert.match(vault.content, /user edit during rollback/);
		assert.ok(storage.data.conceptSourceLinks[link.id]);
	}
}

export const done = run().then(() => console.log("Source provenance removal service tests passed."));
