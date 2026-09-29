import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tests = [
	"tests/cardFileRecognition.test.ts",
	"tests/cardFileLoader.test.ts",
	"tests/conceptMarkdownParser.test.ts",
	"tests/conceptCardAvailability.test.ts",
	"tests/conceptReviewAvailability.test.ts",
	"tests/conceptLoader.test.ts",
	"tests/conceptOwnerConflicts.test.ts",
	"tests/conceptReviewOwnershipGate.test.ts",
	"tests/conceptScanner.test.ts",
	"tests/conceptIdEditor.test.ts",
	"tests/conceptIdRepairOwnership.test.ts",
	"tests/conceptIdRepairModal.test.ts",
	"tests/recoverableConceptIdRepair.test.ts",
	"tests/conceptIdRepairWriteGuards.test.ts",
	"tests/conceptDuplicateDetector.test.ts",
	"tests/conceptMergeService.test.ts",
	"tests/guidedConceptMergeRecovery.test.ts",
	"tests/guidedConceptMergeGuards.test.ts",
	"tests/obsidianGuidedMergeJournal.test.ts",
	"tests/guidedMergeViewRecovery.test.ts",
	"tests/conceptMergeRelatedResolution.test.ts",
	"tests/conceptMergeRedirect.test.ts",
	"tests/conceptMergeMarkdown.test.ts",
	"tests/mergePendingWrites.test.ts",
	"tests/incomingConceptMergeService.test.ts",
	"tests/incomingConceptMergeRecovery.test.ts",
	"tests/incomingConceptMergeGuards.test.ts",
	"tests/incomingConceptMergeViewRecovery.test.ts",
	"tests/conceptConflictMergeDraftStore.test.ts",
	"tests/manualConflictMergeFingerprint.test.ts",
	"tests/conceptMergeDraft.test.ts",
	"tests/conceptMergeAiService.test.ts",
	"tests/conceptEnglishNameAiService.test.ts",
	"tests/conceptDeletionService.test.ts",
	"tests/recoverableConceptDeletion.test.ts",
	"tests/conceptRelatedLinks.test.ts",
	"tests/relatedConceptService.test.ts",
	"tests/simpleFrontmatter.test.ts",
	"tests/conceptLibrarySearch.test.ts",
	"tests/conceptTagCatalog.test.ts",
	"tests/knowledgeContextPackExporter.test.ts",
];

for (const test of tests) {
	const outfile = path.join(tmpdir(), `mneme-${path.basename(test, ".ts")}-${Date.now()}.mjs`);
	const build = spawnSync("npx", [
		"esbuild",
		test,
		"--bundle",
		"--platform=node",
		"--format=esm",
		...(["tests/cardFileLoader.test.ts", "tests/conceptLoader.test.ts", "tests/conceptOwnerConflicts.test.ts"].includes(test) ? ["--alias:obsidian=./tests/helpers/obsidianConceptLoaderStub.ts"] : []),
		...(test === "tests/conceptReviewOwnershipGate.test.ts" ? ["--alias:obsidian=./tests/helpers/obsidianPluginStub.ts"] : []),
		...(test === "tests/conceptIdRepairModal.test.ts" ? ["--alias:obsidian=./tests/helpers/obsidianIdentityRepairStub.ts"] : []),
		...(["tests/incomingConceptMergeViewRecovery.test.ts", "tests/guidedMergeViewRecovery.test.ts", "tests/manualConflictMergeFingerprint.test.ts"].includes(test) ? ["--alias:obsidian=./tests/helpers/obsidianPluginStub.ts"] : []),
		`--outfile=${outfile}`,
	], { stdio: "inherit" });

	if (build.status !== 0) {
		process.exit(build.status ?? 1);
	}

	const run = spawnSync("node", ["--input-type=module", "--eval",
		`const suite = await import(${JSON.stringify(pathToFileURL(outfile).href)}); await suite.done;`,
	], { stdio: "inherit" });

	if (run.status !== 0) {
		process.exit(run.status ?? 1);
	}
}

console.log("Concept Library tests passed.");
