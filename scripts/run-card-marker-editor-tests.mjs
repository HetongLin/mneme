import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const outfile = path.join(tmpdir(), `mneme-card-marker-editor-tests-${Date.now()}.mjs`);
const build = spawnSync("npx", [
	"esbuild",
	"tests/cardDeletionEditor.test.ts",
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

const editorOutfile = path.join(tmpdir(), `mneme-card-marker-editor-tests-editor-${Date.now()}.mjs`);
const editorBuild = spawnSync("npx", [
	"esbuild",
	"tests/cardMarkerEditor.test.ts",
	"--bundle",
	"--platform=node",
	"--format=esm",
	`--outfile=${editorOutfile}`,
], { stdio: "inherit" });

if (editorBuild.status !== 0) {
	process.exit(editorBuild.status ?? 1);
}

const editorRun = spawnSync("node", [editorOutfile], { stdio: "inherit" });

if (editorRun.status !== 0) {
	process.exit(editorRun.status ?? 1);
}
