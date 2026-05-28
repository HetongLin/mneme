import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const outfile = path.join(tmpdir(), `mneme-review-queue-tests-${Date.now()}.mjs`);

await esbuild.build({
	bundle: true,
	entryPoints: ["tests/reviewQueueBuilder.test.ts"],
	format: "esm",
	logLevel: "silent",
	outfile,
	platform: "node",
});

try {
	await import(pathToFileURL(outfile).href);
	console.log("Review queue builder tests passed.");
} finally {
	await unlink(outfile);
}
