import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

for (const test of ["reviewStateStore", "pluginDataMutation", "pluginSettingsConcurrency"]) {
	const outfile = path.join(tmpdir(), `mneme-${test}-tests-${Date.now()}.mjs`);
	await esbuild.build({
		bundle: true,
		entryPoints: [`tests/${test}.test.ts`],
		...(test === "pluginSettingsConcurrency"
			? { alias: { obsidian: "./tests/helpers/obsidianPluginStub.ts" } }
			: {}),
		format: "esm",
		logLevel: "silent",
		outfile,
		platform: "node",
	});
	try {
		const testModule = await import(pathToFileURL(outfile).href);
		await testModule.done;
		console.log(`${test} tests passed.`);
	} finally {
		await unlink(outfile);
	}
}
