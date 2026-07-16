import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const outfile = path.join(tmpdir(), `mneme-user-facing-error-tests-${Date.now()}.mjs`);
const build = spawnSync("npx", [
	"esbuild",
	"tests/userFacingError.test.ts",
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
