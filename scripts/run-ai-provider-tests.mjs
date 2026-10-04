import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

for (const testFile of ["tests/aiProvider.test.ts", "tests/multiProvider.test.ts", "tests/aiCaptureFingerprint.test.ts"]) {
	const outfile = path.join(tmpdir(), `mneme-${path.basename(testFile, ".ts")}-${Date.now()}.mjs`);
	const build = spawnSync("npx", [
		"esbuild",
		testFile,
		"--bundle",
		"--platform=node",
		"--format=esm",
		`--outfile=${outfile}`,
	], { stdio: "inherit" });

	if (build.status !== 0) process.exit(build.status ?? 1);

	const run = spawnSync("node", [outfile], { stdio: "inherit" });
	if (run.status !== 0) process.exit(run.status ?? 1);
}
