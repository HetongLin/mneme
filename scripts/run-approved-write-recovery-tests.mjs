import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const test = "tests/approvedWriteRecovery.test.ts";
const outfile = path.join(tmpdir(), `mneme-${path.basename(test, ".ts")}-${Date.now()}.mjs`);
const build = spawnSync("npx", [
	"esbuild", test, "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`,
], { stdio: "inherit" });

if (build.status !== 0) process.exit(build.status ?? 1);
const run = spawnSync("node", ["--input-type=module", "-e", `await import(${JSON.stringify(outfile)}).then(async (m) => await m.done)`], { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log("Approved write recovery tests passed.");
