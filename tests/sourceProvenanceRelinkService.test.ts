import assert from "node:assert/strict";
import type { ConceptStaleSourceIssue } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import {
	SourceProvenanceRelinkService,
	type SourceProvenanceRelinkVault,
} from "../src/services/sourceProvenanceRelinkService";
import { createConceptSourceLink, createPluginData, createSourceRecord } from "./knowledgeProposalTestUtils";

const conceptPath = "Mneme/Concepts/A/Concept.md";
const oldPath = "Notes/Old.md";
const newPath = "Notes/New.md";
const conceptMarkdown = [
	"---",
	"mneme_type: concept",
	"mneme_id: concept-a",
	"---",
	"# A",
	"",
	"## Source Notes",
	"",
	"> - [[Notes/Old|Old lecture]]",
].join("\n");
const staleLink = createConceptSourceLink("link-old", {
	conceptId: "concept-a",
	evidence: [{ excerpt: "Preserved evidence", heading: "Topic" }],
	relationType: "supporting",
	sourcePath: oldPath,
	status: "stale",
});
const issue: ConceptStaleSourceIssue = {
	conceptId: "concept-a",
	conceptPath,
	conceptTitle: "A",
	link: staleLink,
};

class MemoryVault implements SourceProvenanceRelinkVault {
	files = new Map([
		[conceptPath, { content: conceptMarkdown, mtime: 10, path: conceptPath, size: conceptMarkdown.length }],
		[newPath, { content: "# New source\n", mtime: 20, path: newPath, size: 13 }],
	]);
	failModifyOnce = false;

	async read(path: string): Promise<string> {
		const file = this.files.get(path);
		if (!file) throw new Error(`Missing ${path}`);
		return file.content;
	}

	async readSnapshot(path: string) {
		const file = this.files.get(path);
		if (!file) throw new Error(`Missing ${path}`);
		return { ...file };
	}

	async modify(path: string, content: string): Promise<void> {
		if (this.failModifyOnce) {
			this.failModifyOnce = false;
			throw new Error("modify failed");
		}
		const file = this.files.get(path);
		if (!file) throw new Error(`Missing ${path}`);
		this.files.set(path, { ...file, content, size: content.length });
	}
}

class MemoryStorage {
	saveCalls = 0;
	failAfterWriteOnce = false;
	constructor(public data: MnemePluginData) {}
	async loadData(): Promise<unknown> { return this.data; }
	async saveData(data: MnemePluginData): Promise<void> {
		this.saveCalls += 1;
		this.data = data;
		if (this.failAfterWriteOnce) {
			this.failAfterWriteOnce = false;
			throw new Error("save failed after write");
		}
	}
}

function makeData(): MnemePluginData {
	const oldRecord = { ...createSourceRecord(oldPath), linkedConceptIds: ["concept-a", "concept-b"] };
	const newRecord = { ...createSourceRecord(newPath), lastAiCaptureFingerprint: "ai-fingerprint", linkedConceptIds: ["concept-c"] };
	return createPluginData({}, { [oldPath]: oldRecord, [newPath]: newRecord }, { [staleLink.id]: staleLink });
}

async function readyPlan(vault = new MemoryVault(), storage = new MemoryStorage(makeData())) {
	const service = new SourceProvenanceRelinkService(vault, storage, () => "2026-07-09T10:00:00.000Z");
	const result = await service.prepare(issue, "Notes/New");
	assert.equal(result.status, "ready");
	return { plan: result.plan, service, storage, vault };
}

async function run(): Promise<void> {
	{
		const { plan, storage, vault } = await readyPlan();
		assert.equal(storage.saveCalls, 0);
		assert.equal(await vault.read(conceptPath), conceptMarkdown);
		assert.match(plan.conceptAfter, /\[\[Notes\/New\|Old lecture\]\]/);
		assert.equal(plan.linkAfter.addedAt, staleLink.addedAt);
		assert.deepEqual(plan.linkAfter.evidence, staleLink.evidence);
		assert.equal(plan.linkAfter.relationType, "supporting");
		assert.equal(plan.linkAfter.status, "approved");
		assert.notEqual(plan.linkAfter.sourceHash, staleLink.sourceHash);
		assert.deepEqual(plan.nextData.sourceAnalysisRecords[oldPath].linkedConceptIds, ["concept-b"]);
		assert.deepEqual(plan.nextData.sourceAnalysisRecords[newPath].linkedConceptIds, ["concept-c", "concept-a"]);
		assert.equal(plan.nextData.sourceAnalysisRecords[newPath].lastAiCaptureFingerprint, "ai-fingerprint");
	}

	{
		const { plan, service, storage, vault } = await readyPlan();
		assert.deepEqual(await service.execute(plan), { status: "relinked" });
		assert.match(await vault.read(conceptPath), /\[\[Notes\/New\|Old lecture\]\]/);
		assert.equal(storage.data.conceptSourceLinks[staleLink.id], undefined);
		assert.equal(Object.values(storage.data.conceptSourceLinks)[0].status, "approved");
	}

	{
		const { plan, service, vault } = await readyPlan();
		const current = vault.files.get(conceptPath)!;
		vault.files.set(conceptPath, { ...current, content: `${current.content}\nchanged` });
		assert.equal((await service.execute(plan)).status, "conflict");
	}

	{
		const { plan, service, vault } = await readyPlan();
		const current = vault.files.get(newPath)!;
		vault.files.set(newPath, { ...current, mtime: current.mtime + 1 });
		assert.equal((await service.execute(plan)).status, "conflict");
	}

	{
		const { plan, service, storage, vault } = await readyPlan();
		storage.data = {
			...storage.data,
			pausedConcepts: {
				"concept-other": { conceptId: "concept-other", pausedAt: "2026-07-09T11:00:00.000Z" },
			},
		};
		assert.equal((await service.execute(plan)).status, "conflict");
		assert.equal(await vault.read(conceptPath), conceptMarkdown);
	}

	{
		const prepared = await readyPlan();
		prepared.storage.failAfterWriteOnce = true;
		assert.equal((await prepared.service.execute(prepared.plan)).status, "failed");
		assert.equal(await prepared.vault.read(conceptPath), conceptMarkdown);
		assert.ok(prepared.storage.data.conceptSourceLinks[staleLink.id]);
	}

	{
		const vault = new MemoryVault();
		const current = vault.files.get(conceptPath)!;
		vault.files.set(conceptPath, { ...current, content: current.content.replace("concept-a", "concept-other") });
		const service = new SourceProvenanceRelinkService(vault, new MemoryStorage(makeData()));
		assert.equal((await service.prepare(issue, newPath)).status, "blocked");
		assert.equal((await service.prepare(issue, conceptPath)).status, "blocked");
	}

	{
		const data = makeData();
		const existing = createConceptSourceLink("existing", {
			conceptId: "concept-a",
			evidence: [{ excerpt: "Existing evidence" }],
			relationType: "supporting",
			sourcePath: newPath,
		});
		data.conceptSourceLinks[existing.id] = existing;
		const result = await new SourceProvenanceRelinkService(new MemoryVault(), new MemoryStorage(data)).prepare(issue, newPath);
		assert.equal(result.status, "ready");
		assert.equal(Object.keys(result.plan.nextData.conceptSourceLinks).length, 1);
		assert.deepEqual(result.plan.linkAfter.evidence.map((item) => item.excerpt), ["Existing evidence", "Preserved evidence"]);
	}

	{
		const vault = new MemoryVault();
		const current = vault.files.get(conceptPath)!;
		vault.files.set(conceptPath, {
			...current,
			content: "---\nmneme_type: concept\nmneme_id: concept-a\n---\n# A\n",
		});
		const result = await new SourceProvenanceRelinkService(vault, new MemoryStorage(makeData())).prepare(issue, newPath);
		assert.equal(result.status, "ready");
		assert.match(result.plan.conceptAfter, /## Source Notes/);
		assert.match(result.plan.conceptAfter, /\[\[Notes\/New\]\]/);
	}
}

export const done = run().then(() => {
	console.log("Source provenance relink service tests passed.");
});
