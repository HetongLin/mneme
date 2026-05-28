import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const outfile = path.join(tmpdir(), `mneme-fsrs-retrievability-tests-${Date.now()}.mjs`);

await esbuild.build({
	bundle: true,
	entryPoints: ["tests/fsrsRetrievability.test.ts"],
	format: "esm",
	logLevel: "silent",
	outfile,
	platform: "node",
});

try {
	await import(pathToFileURL(outfile).href);
	console.log("FSRS retrievability tests passed.");
} finally {
	await unlink(outfile);
}
