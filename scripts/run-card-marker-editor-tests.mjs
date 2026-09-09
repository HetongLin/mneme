import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

for (const test of ["cardDeletionEditor", "cardMarkerEditor", "cardIdEditor", "recoverableCardDeletion", "cardDeleteModal", "recoverableCardIdRepair", "cardIdRepairModal", "cardIdRepairWriteGuards"]) {
	const outfile = path.join(tmpdir(), `mneme-${test}-${Date.now()}.mjs`);
	const build = spawnSync("npx", [
		"esbuild", `tests/${test}.test.ts`, "--bundle", "--platform=node", "--format=esm",
		...(["cardDeleteModal", "cardIdRepairModal"].includes(test) ? ["--alias:obsidian=./tests/helpers/obsidianCardDeleteStub.ts"] : []),
		`--outfile=${outfile}`,
	], { stdio: "inherit" });
	if (build.status !== 0) process.exit(build.status ?? 1);
	const run = spawnSync("node", ["--input-type=module", "--eval",
		`const suite = await import(${JSON.stringify(pathToFileURL(outfile).href)}); await suite.done;`,
	], { stdio: "inherit" });
	if (run.status !== 0) process.exit(run.status ?? 1);
}
