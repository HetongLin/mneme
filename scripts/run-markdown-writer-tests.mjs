import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const tests = ["markdownPath", "entityId", "conceptNaming", "conceptMarkdownIdentity", "markdownProposalRenderer", "approvedProposalWriter", "manualConceptService", "manualCardService", "manualCardWriteRecovery", "ankiTsvExporter", "approvedWriteRecovery", "cardComposerView"];

for (const test of tests) {
	const outfile = path.join(tmpdir(), `mneme-${test}-tests-${Date.now()}.mjs`);
	try {
		await esbuild.build({
			bundle: true,
			entryPoints: [`tests/${test}.test.ts`],
			...(test === "cardComposerView" ? { alias: { obsidian: "./tests/helpers/obsidianCardComposerStub.ts" } } : {}),
			format: "esm",
			logLevel: "silent",
			outfile,
			platform: "node",
		});
		const testModule = await import(pathToFileURL(outfile).href);
		await testModule.done;
		console.log(`${test} tests passed.`);
	} finally {
		await unlink(outfile).catch(() => undefined);
	}
}

console.log("Markdown writer tests passed.");
