import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const test = "tests/v1CoreLearningLoop.test.ts";
const outfile = path.join(tmpdir(), `mneme-v1-core-learning-loop-${Date.now()}.mjs`);
const build = spawnSync("npx", [
	"esbuild",
	test,
	"--bundle",
	"--platform=node",
	"--format=esm",
	`--outfile=${outfile}`,
], { stdio: "inherit" });

if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync("node", [outfile], { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
