import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outfile = path.join(tmpdir(), `mneme-review-navigation-tests-${Date.now()}.mjs`);
const build = spawnSync("npx", [
	"esbuild",
	"tests/reviewNavigation.test.ts",
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

const guardOutfile = path.join(tmpdir(), `mneme-review-action-guard-tests-${Date.now()}.mjs`);
const guardBuild = spawnSync("npx", [
	"esbuild",
	"tests/reviewActionGuard.test.ts",
	"--bundle",
	"--alias:obsidian=./tests/helpers/obsidianReviewStub.ts",
	"--platform=node",
	"--format=esm",
	`--outfile=${guardOutfile}`,
], { stdio: "inherit" });

if (guardBuild.status !== 0) {
	process.exit(guardBuild.status ?? 1);
}

const guardRun = spawnSync("node", [
	"--input-type=module",
	"--eval",
	`const suite = await import(${JSON.stringify(pathToFileURL(guardOutfile).href)}); await suite.done;`,
], { stdio: "inherit" });

if (guardRun.status !== 0) {
	process.exit(guardRun.status ?? 1);
}

const ownershipOutfile = path.join(tmpdir(), `mneme-review-rating-ownership-tests-${Date.now()}.mjs`);
const ownershipBuild = spawnSync("npx", [
	"esbuild",
	"tests/reviewRatingOwnership.test.ts",
	"--bundle",
	"--alias:obsidian=./tests/helpers/obsidianReviewLoaderStub.ts",
	"--platform=node",
	"--format=esm",
	`--outfile=${ownershipOutfile}`,
], { stdio: "inherit" });

if (ownershipBuild.status !== 0) {
	process.exit(ownershipBuild.status ?? 1);
}

const ownershipRun = spawnSync("node", [
	"--input-type=module",
	"--eval",
	`const suite = await import(${JSON.stringify(pathToFileURL(ownershipOutfile).href)}); await suite.done;`,
], { stdio: "inherit" });

if (ownershipRun.status !== 0) {
	process.exit(ownershipRun.status ?? 1);
}
