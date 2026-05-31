import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const tests = [
	"tests/aiProvider.test.ts",
	"tests/inboxAcceptanceWorkflow.test.ts",
	"tests/inboxDisplayModel.test.ts",
	"tests/inboxProposalFilters.test.ts",
	"tests/knowledgeProposalDisplay.test.ts",
	"tests/knowledgeProposalLifecycle.test.ts",
	"tests/knowledgeProposalStage.test.ts",
	"tests/knowledgeProposalStore.test.ts",
	"tests/knowledgeProposalValidation.test.ts",
];

for (const test of tests) {
	const outfile = path.join(tmpdir(), `mneme-${path.basename(test, ".ts")}-${Date.now()}.mjs`);
	const build = spawnSync("npx", [
		"esbuild",
		test,
		"--bundle",
		"--platform=node",
		"--format=esm",
		`--outfile=${outfile}`,
	], { stdio: "inherit" });

	if (build.status !== 0) {
		process.exit(build.status ?? 1);
	}

	const run = spawnSync("node", [outfile], { stdio: "inherit" });

	if (run.status !== 0) {
		process.exit(run.status ?? 1);
	}
}

console.log("Knowledge proposal tests passed.");
