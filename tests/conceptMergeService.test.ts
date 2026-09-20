import assert from "node:assert/strict";
import type { ConceptSummary } from "../src/models/conceptLibrary";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import {
	ConceptMergeService,
	type ConceptMergeStorage,
	type ConceptMergeVaultAdapter,
} from "../src/services/conceptMergeService";
import { parseMnemeCards } from "../src/services/cardMarkerParser";
import { createDefaultPluginData } from "../src/services/reviewStateStore";

const survivor = createConcept("concept-a", "Alpha", "Mneme/Concepts/Alpha/Concept.md", "Mneme/Cards/Alpha/Card.md");
const merged = createConcept("concept-b", "Beta", "Mneme/Concepts/Beta/Concept.md", "Mneme/Cards/Beta/Card.md");

async function runAsyncTests(): Promise<void> {
	for (const groupExists of [false, true]) {
		const files = createFiles();
		if (!groupExists) {
			delete files[merged.cardsPath!];
			delete files[survivor.cardsPath!];
		}
		const navigation = `Cards: [[${merged.cardsPath!.replace(/\.md$/, "")}|Beta Cards]]`;
		files[merged.path] += `\n## Review Cards\n\n${navigation}\n\nMy notes about review.\n`;
		const vault = new MemoryMergeVault(files);
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		assert.ok(!final.includes(navigation));
		assert.ok(final.includes("My notes about review."));
		assert.deepEqual(await service.execute(prepared.plan, final), { status: "merged" });
	}

	for (const [fence, inner] of [["````", "```"], ["````", "~~~"], ["~~~~", "~~~"], ["~~~~", "```"], ["````", "```` not a closing fence"]]) {
		const files = createFiles();
		const code = [fence + "markdown", inner, "## Review Cards", `Cards: [[${merged.cardsPath}]]`, "# A code comment", "## Another code comment", fence].join("\n");
		files[merged.path] += `\n${code}\n`;
		const vault = new MemoryMergeVault(files);
		vault.resolveLinkpath = (linkpath) => linkpath;
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		assert.ok(final.includes(code), "Mixed or shorter fence runs must not turn code examples into managed navigation");
		assert.deepEqual(await service.execute(prepared.plan, final), { status: "merged" });
	}

	for (const body of [
		"![image](./asset.png)", "[[#heading]]", "![[#^block]]", "[[ambiguous]]", "[[missing]]",
		"[[self#heading]]", "[note][ref]\n\n[ref]: ./Note.md", "[^footnote]\n\n[^footnote]: Note",
		"[target reference]", "<img src='./asset.png'>",
	]) {
		for (const newline of ["\n", "\r\n"]) {
			const files = createFiles();
			files[merged.path] = conceptMarkdown(merged, body).replace(/\n/g, newline);
			files[survivor.path] += "\n[target reference]: ./target.md\n";
			const vault = new MemoryMergeVault(files);
			vault.resolveLinkpath = (linkpath, path) => linkpath === "self" ? merged.path
				: linkpath === "missing" ? undefined : `${path}/${linkpath}`;
			const storage = new MemoryMergeStorage(createData());
			const before = { ...files };
			const dataBefore = structuredClone(storage.data);
			const service = new ConceptMergeService(vault, storage);
			const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: true });
			assert.equal(prepared.status, "blocked", `Unsafe Concept perspective: ${body}`);
			if (prepared.status === "blocked") assert.match(prepared.message, /Concept concept-b perspective cannot move/);
			assert.deepEqual(vault.files, before);
			assert.deepEqual(storage.data, dataBefore);
			assert.equal(vault.commitCount, 0);
			assert.equal(storage.saveCount, 0);
			// An explicit service caller can omit the perspective; no source body is copied.
			const omitted = await service.prepare({ merged, survivor, preserveMergedAsView: false });
			assert.equal(omitted.status, "ready");
		}
	}

	for (const body of [
		"[website](https://example.com) ![remote](https://example.com/image.png)",
		"[[Notes/Stable#heading|stable note]] ![[assets/stable.png]]",
	]) {
		const files = createFiles();
		files[merged.path] = conceptMarkdown(merged, body)
			+ `\n## Related Concepts\n\n- [[${survivor.path}|Alpha]]\n`;
		const vault = new MemoryMergeVault(files);
		const resolvedFrom: string[] = [];
		vault.resolveLinkpath = (linkpath, path) => {
			resolvedFrom.push(path);
			return `${linkpath}.md`;
		};
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		assert.ok(final.includes(body));
		assert.doesNotMatch(final, /#### Related Concepts/);
		assert.deepEqual(await service.execute(prepared.plan, final), { status: "merged" });
		assert.ok(vault.files[survivor.path]!.includes(body));
		assert.match(vault.files[merged.path]!, /mneme_type: concept_redirect/);
		assert.equal(storage.data.reviewStates["card-b"]?.reviewCount, 2);
		if (body.includes("[[")) {
			assert.ok(resolvedFrom.includes(merged.path));
			assert.ok(resolvedFrom.includes(survivor.path));
		}
	}

	for (const change of ["wiki-resolution", "edited-definition"] as const) {
		const files = createFiles();
		files[merged.path] = conceptMarkdown(merged, change === "wiki-resolution" ? "![[stable.png]]" : "A literal [new label]");
		const vault = new MemoryMergeVault(files);
		vault.resolveLinkpath = () => "assets/stable.png";
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		let final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		if (change === "wiki-resolution") {
			vault.resolveLinkpath = (_linkpath, path) => path === merged.path ? "assets/stable.png" : "other/stable.png";
		} else {
			// The final edited draft introduces a definition without changing any Vault snapshot.
			final += "\n[new label]: ./other.md\n";
		}
		const before = { ...files };
		const dataBefore = structuredClone(storage.data);
		assert.equal((await service.execute(prepared.plan, final)).status, "conflict");
		assert.deepEqual(vault.files, before);
		assert.deepEqual(storage.data, dataBefore);
		assert.equal(vault.commitCount, 0);
		assert.equal(storage.saveCount, 0);
	}

	for (const content of [
		"![image](./asset.png)", "[note](../Note.md)", "[heading](#heading)",
		"[nested [label]](./asset.png)", "![image](<asset with spaces.png>)",
		"[note](/Notes/Note.md)", "[note](file:./Note.md)",
		"[[#heading]]", "![[#^block]]", "[[missing]]", "[[ambiguous#heading|label]]",
		"[[self#^block]]", "![[asset.png]]", "[label][definition]", "[definition][]",
		"[^footnote]", "^[inline footnote]", "[definition]", "[outer [definition]]", "[TARGET\n definition]",
		"[unused]: https://example.com", "<img src='./asset.png'>", "<a href='./Note.md'>note</a>",
	]) {
		const files = createFiles();
		files[merged.cardsPath!] = cardMarkdown(merged, "card-b", content, "Answer")
			+ "\n[definition]: ./source.png\n[^footnote]: Source footnote\n";
		files[survivor.cardsPath!] += "\n[target definition]: ./target.png\n";
		const vault = new MemoryMergeVault(files);
		vault.resolveLinkpath = (linkpath, path) => linkpath === "self" ? merged.cardsPath
			: linkpath === "missing" ? undefined : `${path}/${linkpath}`;
		const storage = new MemoryMergeStorage(createData());
		const before = { ...files };
		const dataBefore = JSON.stringify(storage.data);
		const prepared = await new ConceptMergeService(vault, storage).prepare({ merged, survivor, preserveMergedAsView: false });
		assert.equal(prepared.status, "blocked", `Unsafe relocated content: ${content}`);
		if (prepared.status === "blocked") assert.match(prepared.message, /Card card-b cannot move.*Review its references/);
		assert.deepEqual(vault.files, before);
		assert.equal(JSON.stringify(storage.data), dataBefore);
		assert.equal(vault.commitCount, 0);
		assert.equal(storage.saveCount, 0);
	}

	for (const content of [
		"[website](https://example.com/path#heading) ![remote](https://example.com/image.png)",
		"[email](mailto:hello@example.com) [call](tel:+1234) ![inline](data:image/png;base64,AAAA)",
		"A plain [label] without a definition",
		"[[Notes/Stable#heading|label]] ![[assets/stable.png]]",
	]) {
		const files = createFiles();
		files[merged.cardsPath!] = cardMarkdown(merged, "card-b", content, "Answer");
		const raw = files[merged.cardsPath!]!.match(/<!-- MNEME:CARD:start[\s\S]*<!-- MNEME:CARD:end -->/)![0];
		const vault = new MemoryMergeVault(files);
		vault.resolveLinkpath = (linkpath) => `${linkpath}.md`;
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: false });
		assert.equal(prepared.status, "ready", content);
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.deepEqual(await service.execute(prepared.plan, prepared.plan.writes.find((w) => w.path === survivor.path)!.after), { status: "merged" });
		assert.ok(vault.files[survivor.cardsPath!]!.includes(raw));
		assert.deepEqual(parseMnemeCards(vault.files[survivor.cardsPath!]!).map((card) => card.explicitCardId), ["card-a", "card-b"]);
		assert.equal(storage.data.reviewStates["card-b"]?.reviewCount, 2);
	}

	{
		const files = createFiles();
		files[merged.cardsPath!] = cardMarkdown(merged, "card-b", "[[Notes/Stable]]", "Answer");
		const vault = new MemoryMergeVault(files);
		const storage = new MemoryMergeStorage(createData());
		const before = { ...files };
		const prepared = await new ConceptMergeService(vault, storage).prepare({ merged, survivor, preserveMergedAsView: false });
		assert.equal(prepared.status, "blocked", "An unavailable resolver must not silently accept Wiki relocation");
		assert.deepEqual(vault.files, before);
		assert.equal(vault.commitCount, 0);
		assert.equal(storage.saveCount, 0);
	}

	{
		const files = createFiles();
		files[merged.cardsPath!] = cardMarkdown(merged, "card-b", "![[stable.png]]", "Answer");
		const vault = new MemoryMergeVault(files);
		vault.resolveLinkpath = () => "assets/stable.png";
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: false });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		// No participant Markdown or Mneme state changed; another file changed Wiki resolution.
		vault.resolveLinkpath = (_linkpath, path) => path === merged.cardsPath ? "assets/stable.png" : "other/stable.png";
		const before = { ...vault.files };
		const dataBefore = JSON.stringify(storage.data);
		const result = await service.execute(prepared.plan, prepared.plan.writes.find((w) => w.path === survivor.path)!.after);
		assert.equal(result.status, "conflict");
		assert.deepEqual(vault.files, before);
		assert.equal(JSON.stringify(storage.data), dataBefore);
		assert.equal(vault.commitCount, 0);
		assert.equal(storage.saveCount, 0);
	}

	{
		// Adopting a source group retains its rendering path, including local references.
		const files = createFiles();
		delete files[survivor.cardsPath!];
		files[merged.cardsPath!] = cardMarkdown(merged, "card-b", "![image](./asset.png) [[#heading]]", "Answer");
		const vault = new MemoryMergeVault(files);
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, survivor, preserveMergedAsView: false });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.equal(prepared.plan.targetCardsPath, merged.cardsPath);
		assert.deepEqual(await service.execute(prepared.plan, prepared.plan.writes.find((w) => w.path === survivor.path)!.after), { status: "merged" });
		assert.ok(vault.files[merged.cardsPath!]!.includes("![image](./asset.png) [[#heading]]"));
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage, () => "2026-07-09T10:00:00.000Z");
		const filesBeforePreview = { ...vault.files };
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "ready");
		assert.deepEqual(vault.files, filesBeforePreview);
		assert.equal(storage.saveCount, 0);
		if (prepared.status !== "ready") {
			throw new Error(prepared.message);
		}
		const { plan } = prepared;
		assert.equal(plan.cardsMoved, 1);
		assert.equal(plan.cardsPreserved, 2);
		assert.equal(plan.pauseMigrated, true);
		assert.equal(plan.duplicateDismissalsMigrated, 1);
		assert.equal(plan.sourceLinksMigrated, 1);
		assert.equal(plan.sourceLinksPreserved, 1);
		assert.equal(plan.relatedConceptsRewired, 0);
		assert.deepEqual(plan.sourceLinkChanges, [{
			relationType: "origin",
			sourcePath: "Notes/Shared.md",
			status: "approved",
		}]);
		assert.equal(plan.writes.length, 4);
		const targetCards = plan.writes.find((write) => write.path === survivor.cardsPath)?.after ?? "";
		assert.deepEqual(parseMnemeCards(targetCards).map((card) => card.explicitCardId), ["card-a", "card-b"]);
		const oldCards = plan.writes.find((write) => write.path === merged.cardsPath)?.after ?? "";
		assert.deepEqual(parseMnemeCards(oldCards), []);
		assert.match(oldCards, /redirect_cards_to:/);
		const finalConcept = plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		assert.match(finalConcept, /### Merged from Beta \(concept-b\)/);
		assert.match(finalConcept, /#### Source Notes/);
		assert.match(finalConcept, /\[\[Notes\/Shared\]\]/);
		assert.match(plan.writes.find((write) => write.path === merged.path)?.after ?? "", /mneme_type: concept_redirect/);
		assert.equal(plan.nextData.pausedConcepts["concept-a"]?.conceptId, "concept-a");
		assert.equal(plan.nextData.pausedConcepts["concept-b"], undefined);
		assert.deepEqual(plan.nextData.sourceAnalysisRecords["Notes/Shared.md"]?.linkedConceptIds, ["concept-a"]);
		assert.equal(plan.nextData.conceptMergeRecords["concept-b"]?.survivorConceptId, "concept-a");
		const sharedLink = Object.values(plan.nextData.conceptSourceLinks)
			.find((link) => link.sourcePath === "Notes/Shared.md");
		assert.equal(sharedLink?.evidence.length, 2);
		assert.equal(plan.nextData.conceptSourceLinks.unrelatedOne?.conceptId, "concept-z");
		assert.equal(plan.nextData.conceptSourceLinks.unrelatedTwo?.conceptId, "concept-z");
		assert.doesNotMatch(finalConcept, /Notes\/Unrelated/);
		assert.equal(Object.values(plan.nextData.conceptDuplicateDismissals)[0]?.conceptIds.includes("concept-a"), true);
		assert.equal(plan.nextData.conceptMergeRecords["concept-old"]?.survivorConceptId, "concept-a");

		const result = await service.execute(plan, finalConcept);
		assert.deepEqual(result, { status: "merged" });
		assert.match(vault.files[merged.path] ?? "", /concept_redirect/);
		assert.equal(storage.data.conceptMergeRecords["concept-b"]?.survivorPath, survivor.path);
		assert.equal(storage.data.reviewStates["card-b"]?.reviewCount, 2);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		vault.racePath = survivor.path;
		vault.raceEdit = "\nEdit made after the initial check\n";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "conflict");
		assert.match(vault.files[survivor.path] ?? "", /Edit made after the initial check/);
		assert.equal(storage.saveCount, 0);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") {
			return;
		}
		vault.files[survivor.path] += "\nConcurrent edit\n";
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "conflict");
		assert.equal(storage.saveCount, 0);
		assert.match(vault.files[survivor.path] ?? "", /Concurrent edit/);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			storage.data = {
				...storage.data,
				settings: { ...storage.data.settings, fsrsEnabled: false },
			};
			const before = { ...vault.files };
			const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			const result = await service.execute(prepared.plan, finalConcept);

			assert.equal(result.status, "conflict");
			assert.deepEqual(vault.files, before);
			assert.equal(storage.saveCount, 0);
		}
	}

	{
		const gamma = createConcept("concept-gamma", "Gamma", "Mneme/Concepts/Gamma.md");
		const delta = createConcept("concept-delta", "Delta", "Mneme/Concepts/Delta.md");
		const files = createFiles();
		files[survivor.path] = `${files[survivor.path]?.trimEnd()}\n\n## Related Concepts\n\n- [[${merged.path.replace(/\.md$/, "")}|Beta]]\n- [[${gamma.path.replace(/\.md$/, "")}|Gamma]]\n`;
		files[merged.path] = `${files[merged.path]?.trimEnd()}\n\n## Related Concepts\n\n- [[${survivor.path.replace(/\.md$/, "")}|Alpha]]\n- [[${delta.path.replace(/\.md$/, "")}|Delta]]\n- [[External/Unknown|Unknown]]\n`;
		files[gamma.path] = `${conceptMarkdown(gamma, "Gamma core.").trimEnd()}\n\n## Related Concepts\n\n- [[${merged.path.replace(/\.md$/, "")}|Beta]]\n`;
		files[delta.path] = `${conceptMarkdown(delta, "Delta core.").trimEnd()}\n\n## Related Concepts\n\n- [[${merged.path.replace(/\.md$/, "")}|Beta]]\n`;
		const vault = new MemoryMergeVault(files);
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			assert.equal(prepared.plan.relatedConceptsRewired, 2);
			const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			assert.match(finalConcept, /Mneme\/Concepts\/Gamma\|Gamma/);
			assert.match(finalConcept, /Mneme\/Concepts\/Delta\|Delta/);
			assert.match(finalConcept, /External\/Unknown\|Unknown/);
			assert.doesNotMatch(finalConcept, /Mneme\/Concepts\/Beta\/Concept\|Beta/);
			assert.doesNotMatch(finalConcept, /#### Related Concepts/);

			const gammaWrite = prepared.plan.writes.find((write) => write.path === gamma.path)?.after ?? "";
			const deltaWrite = prepared.plan.writes.find((write) => write.path === delta.path)?.after ?? "";
			assert.match(gammaWrite, /Mneme\/Concepts\/Alpha\/Concept\|Alpha/);
			assert.match(deltaWrite, /Mneme\/Concepts\/Alpha\/Concept\|Alpha/);
			assert.doesNotMatch(gammaWrite, /Mneme\/Concepts\/Beta\/Concept/);
			assert.doesNotMatch(deltaWrite, /Mneme\/Concepts\/Beta\/Concept/);
			const alteredRelations = finalConcept.replace(/- \[\[Mneme\/Concepts\/Gamma\|Gamma\]\]\n/, "");
			const alteredResult = await service.execute(prepared.plan, alteredRelations);
			assert.equal(alteredResult.status, "invalid");
		}
	}

	{
		const data = createData();
		data.knowledgeProposals.blocking = {
			conceptId: "concept-b",
			createdAt: "2026-07-09T09:00:00.000Z",
			id: "blocking",
			kind: "update_concept",
			status: "suggested",
			updatedAt: "2026-07-09T09:00:00.000Z",
		};
		const service = new ConceptMergeService(new MemoryMergeVault(createFiles()), new MemoryMergeStorage(data));
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "blocked");
		if (prepared.status === "blocked") {
			assert.match(prepared.message, /Resolve Inbox proposal/);
		}
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") {
			return;
		}
		storage.partialFailOnce = true;
		const before = { ...vault.files };
		const dataBefore = JSON.stringify(storage.data);
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "failed");
		assert.deepEqual(vault.files, before);
		assert.equal(JSON.stringify(storage.data), dataBefore);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		storage.partialFailOnce = true;
		vault.rollbackRaceAfter = prepared.plan.writes.filter((write) => write.after !== write.before).length;
		vault.rollbackRacePath = survivor.path;
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "failed");
		assert.match(vault.files[survivor.path] ?? "", /Edit made during rollback/);
		assert.equal(JSON.stringify(storage.data), JSON.stringify(createData()));
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const changedPath = prepared.plan.writes.find((write) => write.path === merged.path)?.path;
		if (!changedPath) throw new Error("Expected merged concept write");
		vault.changeAfterCommit = 1;
		vault.changeAfterCommitPath = changedPath;
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const result = await service.execute(prepared.plan, finalConcept);

		assert.equal(result.status, "conflict");
		assert.equal(vault.files[survivor.path], createFiles()[survivor.path]);
		assert.match(vault.files[changedPath] ?? "", /Edit made during execution/);
		assert.equal(JSON.stringify(storage.data), JSON.stringify(createData()));
	}

	{
		const files = createFiles();
		files[merged.cardsPath as string] = files[merged.cardsPath as string]?.replace('id="card-b"', "") ?? "";
		const service = new ConceptMergeService(new MemoryMergeVault(files), new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });

		assert.equal(prepared.status, "blocked");
		if (prepared.status === "blocked") {
			assert.match(prepared.message, /Repair every Card ID/);
		}
	}

	{
		const survivorWithoutCards: ConceptSummary = { ...survivor, cardsPath: undefined };
		const files = createFiles();
		delete files[survivor.cardsPath as string];
		files[survivor.path] = conceptMarkdown(survivorWithoutCards, "Alpha without cards.");
		const vault = new MemoryMergeVault(files);
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({
			merged,
			preserveMergedAsView: false,
			survivor: survivorWithoutCards,
		});

		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			assert.equal(prepared.plan.cardsMoved, 1);
			assert.equal(prepared.plan.targetCardsPath, merged.cardsPath);
			assert.equal(prepared.plan.writes.length, 3);
			const adoptedCards = prepared.plan.writes.find((write) => write.path === merged.cardsPath)?.after ?? "";
			assert.match(adoptedCards, /mneme_concept_id: concept-a/);
			assert.match(prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "", /cards: "\[\[Mneme\/Cards\/Beta\/Card\|Alpha Cards\]\]"/);
		}
	}

	{
		const files = createFiles();
		delete files[survivor.cardsPath as string];
		delete files[merged.cardsPath as string];
		const vault = new MemoryMergeVault(files);
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({
			merged,
			preserveMergedAsView: false,
			survivor,
		});

		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			assert.equal(prepared.plan.cardsMoved, 0);
			assert.equal(prepared.plan.cardsPreserved, 0);
			assert.equal(prepared.plan.targetCardsPath, survivor.cardsPath);
			assert.equal(
				prepared.plan.writes.some((write) => write.path === survivor.cardsPath || write.path === merged.cardsPath),
				false,
			);
			const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			assert.match(finalConcept, /cards: "\[\[Mneme\/Cards\/Alpha\/Card\|Alpha Cards\]\]"/);
			assert.deepEqual(await service.execute(prepared.plan, finalConcept), { status: "merged" });
		}
	}

	{
		const files = createFiles();
		delete files[survivor.cardsPath as string];
		const vault = new MemoryMergeVault(files);
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({
			merged,
			preserveMergedAsView: false,
			survivor,
		});

		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			assert.equal(prepared.plan.targetCardsPath, merged.cardsPath);
			const adoptedCards = prepared.plan.writes.find((write) => write.path === merged.cardsPath)?.after ?? "";
			assert.match(adoptedCards, /mneme_concept_id: concept-a/);
		}
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: false, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status === "ready") {
			const validFinalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
			const finalConcept = validFinalConcept
				.replace("mneme_id: concept-a", "mneme_id: changed");
			const result = await service.execute(prepared.plan, finalConcept);
			assert.equal(result.status, "invalid");
			const wrongCardsResult = await service.execute(
				prepared.plan,
				validFinalConcept.replace("Mneme/Cards/Alpha/Card", "Mneme/Cards/Other/Card"),
			);
			assert.equal(wrongCardsResult.status, "invalid");
			assert.equal(storage.saveCount, 0);
		}
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		assert.ok(prepared.plan.writes.filter((write) => write.after !== write.before).length >= 2);
		const beforeFiles = { ...vault.files };
		const beforeData = structuredClone(storage.data);
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		vault.throwAfterProcessAt = 2;
		const result = await service.execute(prepared.plan, finalConcept);
		assert.equal(result.status, "failed");
		assert.deepEqual(vault.files, beforeFiles);
		assert.deepEqual(storage.data, beforeData);
		assert.equal(storage.saveCount, 0);
	}

	{
		const vault = new MemoryMergeVault(createFiles());
		const storage = new MemoryMergeStorage(createData());
		const service = new ConceptMergeService(vault, storage);
		const prepared = await service.prepare({ merged, preserveMergedAsView: true, survivor });
		assert.equal(prepared.status, "ready");
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const finalConcept = prepared.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
		const racedWrite = prepared.plan.writes.find((write) => write.after !== write.before);
		assert.ok(racedWrite);
		const beforeFiles = { ...vault.files };
		const beforeData = structuredClone(storage.data);
		vault.throwAfterProcessAt = 1;
		vault.throwAfterProcessEdit = "\nLearner edit during rollback\n";
		const result = await service.execute(prepared.plan, finalConcept);
		assert.equal(result.status, "failed");
		assert.match(result.message, /Rollback also failed/i);
		assert.deepEqual(vault.files, {
			...beforeFiles,
			[racedWrite.path]: `${racedWrite.after}\nLearner edit during rollback\n`,
		});
		assert.deepEqual(storage.data, beforeData);
		assert.equal(storage.saveCount, 0);
	}

	for (const side of ["survivor", "merged"] as const) {
		for (const mutation of ["changed", "deleted", "added"] as const) {
			const files = createFiles();
			const selected = side === "survivor" ? survivor : merged;
			const original = files[selected.path] ?? "";
			if (mutation === "changed") {
				files[selected.path] = original.replace(
					/^cards:.*$/m,
					"cards: \"[[Mneme/Cards/Other/Card.md|Other Cards]]\"",
				);
				files["Mneme/Cards/Other/Card.md"] = cardMarkdown(selected, "card-other", "Other question", "Other answer");
			} else if (mutation === "deleted") {
				files[selected.path] = original.replace(/^cards:.*\n/m, "");
			}
			const input = {
				merged: side === "merged" && mutation === "added" ? { ...merged, cardsPath: undefined } : merged,
				preserveMergedAsView: false,
				survivor: side === "survivor" && mutation === "added" ? { ...survivor, cardsPath: undefined } : survivor,
			};
			const vault = new MemoryMergeVault(files);
			const storage = new MemoryMergeStorage(createData());
			const beforeFiles = { ...vault.files };
			const beforeData = structuredClone(storage.data);
			const result = await new ConceptMergeService(vault, storage).prepare(input);
			assert.equal(result.status, "blocked", `${side}/${mutation}`);
			if (result.status === "blocked") assert.match(result.message, /Card Group link/i);
			assert.deepEqual(vault.files, beforeFiles);
			assert.deepEqual(storage.data, beforeData);
			assert.equal(storage.saveCount, 0);
			assert.equal(vault.commitCount, 0);
		}
	}

	for (const side of ["survivor", "merged"] as const) {
		for (const variant of ["double", "single", "double-key", "single-key", "comment", "crlf"] as const) {
			const files = createFiles();
			const selected = side === "survivor" ? survivor : merged;
			const target = selected.cardsPath?.replace(/\.md$/i, "") ?? "";
			const key = variant === "double-key" ? '"cards"' : variant === "single-key" ? "'cards'" : "cards";
			const value = variant === "single"
				? `${key}: '[[${target}|${selected.title} Alias]]'`
				: `${key}: "[[${target}|${selected.title} Alias]]"${variant === "comment" ? " # cached alias" : ""}`;
			files[selected.path] = (files[selected.path] ?? "").replace(/^cards:.*$/m, value);
			if (variant === "crlf") files[selected.path] = files[selected.path].replace(/\n/g, "\r\n");
			const vault = new MemoryMergeVault(files);
			const storage = new MemoryMergeStorage(createData());
			const service = new ConceptMergeService(vault, storage);
			const result = await service.prepare({ merged, preserveMergedAsView: false, survivor });
			assert.equal(result.status, "ready", `${side}/${variant}`);
			if (result.status === "ready") {
				const finalConcept = result.plan.writes.find((write) => write.path === survivor.path)?.after ?? "";
				assert.deepEqual(await service.execute(result.plan, finalConcept), { status: "merged" });
				assert.equal((vault.files[survivor.path]?.match(/^(?:cards|"cards"|'cards'):/gm) ?? []).length, 1);
			}
		}
	}

	for (const newline of ["\n", "\r\n"]) {
		for (const count of [0, 1, 2]) {
			const files = createFiles();
			const blocks = Array.from({ length: count }, (_, index) =>
				cardMarkdown(merged, `card-source-${index}`, `Question ${index}`, `Answer ${index}`)
					.match(/<!-- MNEME:CARD:start[\s\S]*?<!-- MNEME:CARD:end -->/)![0]);
			const prefix = "# My Card notebook\n\n> [!note] Personal context\n> Keep this introduction.\n";
			const middle = "\n## My annotations\n\nKeep this table | and [[My Link]].\n";
			const suffix = "\n[^reference]: Keep the reference.\n<!-- private annotation -->\n";
			const source = [
				"---", "mneme_type: card_group", `mneme_concept_id: ${merged.conceptId}`,
				`concept: "[[${merged.path}]]"`, 'custom_property: "Keep this"',
				"custom_list:", "  - keep-one", "  - keep-two", "---",
				prefix, blocks[0] ?? "", middle, blocks[1] ?? "", suffix,
			].join("\n").replace(/\n/g, newline);
			files[merged.cardsPath!] = source;
			const vault = new MemoryMergeVault(files);
			const storage = new MemoryMergeStorage(createData());
			const statesBefore = structuredClone(storage.data.reviewStates);
			const service = new ConceptMergeService(vault, storage);
			const prepared = await service.prepare({ survivor, merged, preserveMergedAsView: true });
			if (prepared.status !== "ready") throw new Error(prepared.message);
			const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
			assert.deepEqual(await service.execute(prepared.plan, final), { status: "merged" });
			const former = vault.files[merged.cardsPath!]!;
			assert.match(former, /custom_property: "Keep this"/);
			assert.match(former, /custom_list:\n  - keep-one\n  - keep-two/);
			for (const text of [prefix, middle, suffix]) {
				assert.ok(former.includes(text.replace(/\n/g, newline)), text);
			}
			assert.match(former, /mneme_concept_id: concept-a/);
			assert.match(former, /redirect_cards_to:/);
			assert.deepEqual(parseMnemeCards(former), []);
			const target = vault.files[survivor.cardsPath!]!;
			for (const block of blocks) assert.ok(target.includes(block.replace(/\n/g, newline)));
			assert.deepEqual(parseMnemeCards(target).map((card) => card.explicitCardId),
				["card-a", ...blocks.map((_, index) => `card-source-${index}`)]);
			assert.deepEqual(storage.data.reviewStates, statesBefore);
		}
	}

	for (const side of [survivor, merged]) {
		for (const adoptSource of [false, true]) {
			if (adoptSource && side === survivor) continue;
			const files = createFiles();
			if (adoptSource) delete files[survivor.cardsPath!];
			const original = files[side.cardsPath!]!;
			const block = original.match(/<!-- MNEME:CARD:start[\s\S]*?<!-- MNEME:CARD:end -->/)![0];
			files[side.cardsPath!] = `${original}\n${block}\n`;
			const vault = new MemoryMergeVault(files);
			const storage = new MemoryMergeStorage(createData());
			const beforeFiles = { ...files };
			const beforeData = structuredClone(storage.data);
			const prepared = await new ConceptMergeService(vault, storage).prepare({ survivor, merged, preserveMergedAsView: true });
			assert.equal(prepared.status, "blocked");
			if (prepared.status === "blocked") assert.match(prepared.message, /Card ID .* more than once/);
			assert.deepEqual(vault.files, beforeFiles);
			assert.deepEqual(storage.data, beforeData);
			assert.equal(vault.commitCount, 0);
			assert.equal(storage.saveCount, 0);
		}
	}


	for (const side of [survivor, merged]) {
		const files = createFiles();
		files[side.cardsPath!] += "\n<!-- MNEME:FRONT:start -->\nLegacy question\n<!-- MNEME:FRONT:end -->\n";
		const vault = new MemoryMergeVault(files);
		const storage = new MemoryMergeStorage(createData());
		const before = { ...files };
		const prepared = await new ConceptMergeService(vault, storage).prepare({ survivor, merged, preserveMergedAsView: true });
		assert.equal(prepared.status, "blocked");
		if (prepared.status === "blocked") assert.match(prepared.message, /section markers outside a Card block/);
		assert.deepEqual(vault.files, before);
		assert.equal(vault.commitCount, 0);
		assert.equal(storage.saveCount, 0);
	}

	{
		const files = createFiles();
		files[merged.cardsPath!] = files[merged.cardsPath!]!.replace("mneme_type: card_group", '"mneme_type": "card_group"');
		const vault = new MemoryMergeVault(files);
		const service = new ConceptMergeService(vault, new MemoryMergeStorage(createData()));
		const prepared = await service.prepare({ survivor, merged, preserveMergedAsView: true });
		if (prepared.status !== "ready") throw new Error(prepared.message);
		const final = prepared.plan.writes.find((write) => write.path === survivor.path)!.after;
		assert.deepEqual(await service.execute(prepared.plan, final), { status: "merged" });
		assert.deepEqual(parseMnemeCards(vault.files[merged.cardsPath!]!), []);
	}

}

class MemoryMergeVault implements ConceptMergeVaultAdapter {
	resolveLinkpath?: (linkpath: string, sourcePath: string) => string | undefined;
	commitCount = 0;
	throwAfterProcessAt?: number;
	throwAfterProcessEdit?: string;
	racePath?: string;
	raceEdit?: string;
	rollbackRaceAfter?: number;
	rollbackRacePath?: string;
	changeAfterCommit?: number;
	changeAfterCommitPath?: string;

	constructor(public files: Record<string, string>) {
	}

	async exists(path: string): Promise<boolean> {
		return this.files[path] !== undefined;
	}

	async read(path: string): Promise<string> {
		const content = this.files[path];
		if (content === undefined) throw new Error(`Missing file: ${path}`);
		return content;
	}

	async listMarkdownFiles(): Promise<Array<{ path: string }>> {
		return Object.keys(this.files).filter((path) => path.endsWith(".md")).map((path) => ({ path }));
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		this.maybeRaceDuringRollback(path);
		if (this.racePath === path && this.raceEdit) {
			this.files[path] += this.raceEdit;
			this.racePath = undefined;
			this.raceEdit = undefined;
		}
		const current = this.files[path];
		if (current === undefined) throw new Error(`Missing file: ${path}`);
		const next = transform(current);
		this.files[path] = next;
		this.commitCount += 1;
		if (this.throwAfterProcessAt === this.commitCount) {
			this.throwAfterProcessAt = undefined;
			if (this.throwAfterProcessEdit) this.files[path] += this.throwAfterProcessEdit;
			throw new Error("Injected after-process failure");
		}
		if (this.changeAfterCommit === this.commitCount && this.changeAfterCommitPath) {
			this.files[this.changeAfterCommitPath] += "\nEdit made during execution\n";
			this.changeAfterCommit = undefined;
		}
	}

	private maybeRaceDuringRollback(path: string): void {
		if (path === this.rollbackRacePath && this.rollbackRaceAfter !== undefined && this.commitCount >= this.rollbackRaceAfter) {
			this.rollbackRaceAfter = undefined;
			this.files[path] = `${this.files[path] ?? ""}\nEdit made during rollback\n`;
		}
	}
}

class MemoryMergeStorage implements ConceptMergeStorage {
	data: MnemePluginData;
	partialFailOnce = false;
	saveCount = 0;

	constructor(data: MnemePluginData) {
		this.data = data;
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		if (this.partialFailOnce) {
			this.data = data;
			this.partialFailOnce = false;
			throw new Error("Partial persist failed");
		}
		this.data = data;
		this.saveCount += 1;
	}
}

function createConcept(conceptId: string, title: string, path: string, cardsPath?: string): ConceptSummary {
	return { cardsPath, conceptId, coreMeaning: `${title} core`, path, title };
}

function createFiles(): Record<string, string> {
	return {
		[survivor.path]: conceptMarkdown(survivor, "Alpha explains the surviving idea."),
		[merged.path]: conceptMarkdown(merged, "Beta explains another perspective."),
		[survivor.cardsPath as string]: cardMarkdown(survivor, "card-a", "Alpha question", "Alpha answer"),
		[merged.cardsPath as string]: cardMarkdown(merged, "card-b", "Beta question", "Beta answer"),
	};
}

function conceptMarkdown(concept: ConceptSummary, core: string): string {
	const lines = [
		"---",
		"mneme_type: concept",
		`mneme_id: ${concept.conceptId}`,
	];
	if (concept.cardsPath) {
		lines.push(`cards: "[[${concept.cardsPath}|${concept.title} Cards]]"`);
	}
	lines.push(
		"---",
		`# ${concept.title}`,
		"",
		"## Core Meaning",
		"",
		core,
		"",
		"## Source Notes",
		"",
		"> [!info]- Source Notes",
		"> Add source notes here.",
		"",
	);
	return lines.join("\n");
}

function cardMarkdown(concept: ConceptSummary, cardId: string, front: string, back: string): string {
	return [
		"---",
		"mneme_type: card_group",
		`mneme_concept_id: ${concept.conceptId}`,
		`concept: "[[${concept.path}|${concept.title}]]"`,
		"---",
		`# ${concept.title} Cards`,
		"",
		`<!-- MNEME:CARD:start id="${cardId}" -->`,
		"<!-- MNEME:FRONT:start -->",
		front,
		"<!-- MNEME:FRONT:end -->",
		"<!-- MNEME:BACK:start -->",
		back,
		"<!-- MNEME:BACK:end -->",
		"<!-- MNEME:CARD:end -->",
		"",
	].join("\n");
}

function createData(): MnemePluginData {
	const data = createDefaultPluginData();
	data.settings = DEFAULT_SETTINGS;
	data.pausedConcepts["concept-b"] = { conceptId: "concept-b", pausedAt: "2026-07-08T10:00:00.000Z" };
	data.reviewStates["card-b"] = {
		cardId: "card-b",
		createdAt: "2026-07-08T10:00:00.000Z",
		lapseCount: 0,
		reviewCount: 2,
		updatedAt: "2026-07-08T10:00:00.000Z",
	};
	data.sourceAnalysisRecords["Notes/Shared.md"] = {
		contentHash: "hash",
		lastAnalyzedAt: "2026-07-08T10:00:00.000Z",
		linkedConceptIds: ["concept-a", "concept-b"],
		mtime: 1,
		pendingProposalIds: [],
		size: 1,
		sourcePath: "Notes/Shared.md",
		status: "clean",
	};
	data.conceptSourceLinks.a = {
		addedAt: "2026-07-07T10:00:00.000Z",
		conceptId: "concept-a",
		evidence: [{ excerpt: "Alpha evidence" }],
		id: "a",
		lastSeenAt: "2026-07-08T10:00:00.000Z",
		relationType: "origin",
		sourceHash: "hash-a",
		sourcePath: "Notes/Shared.md",
		status: "approved",
	};
	data.conceptSourceLinks.b = {
		addedAt: "2026-07-08T10:00:00.000Z",
		conceptId: "concept-b",
		evidence: [{ excerpt: "Beta evidence" }],
		id: "b",
		lastSeenAt: "2026-07-09T10:00:00.000Z",
		relationType: "origin",
		sourceHash: "hash-b",
		sourcePath: "Notes/Shared.md",
		status: "approved",
	};
	for (const id of ["unrelatedOne", "unrelatedTwo"]) {
		data.conceptSourceLinks[id] = {
			addedAt: "2026-07-08T10:00:00.000Z",
			conceptId: "concept-z",
			evidence: [{ excerpt: id }],
			id,
			lastSeenAt: "2026-07-09T10:00:00.000Z",
			relationType: "supporting",
			sourceHash: "unrelated",
			sourcePath: "Notes/Unrelated.md",
			status: "approved",
		};
	}
	data.conceptMergeRecords["concept-old"] = {
		mergedAt: "2026-07-01T10:00:00.000Z",
		mergedConceptId: "concept-old",
		mergedPath: "Mneme/Concepts/Old/Concept.md",
		survivorConceptId: "concept-b",
		survivorPath: merged.path,
	};
	data.conceptDuplicateDismissals['["concept-b","concept-c"]'] = {
		conceptIds: ["concept-b", "concept-c"],
		dismissedAt: "2026-07-08T10:00:00.000Z",
		pairKey: '["concept-b","concept-c"]',
	};
	return data;
}

export const done = runAsyncTests();
