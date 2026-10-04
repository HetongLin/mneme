import { existsSync, readFileSync, statSync } from "node:fs";
import { getReleaseMetadataIssues } from "./release-metadata.mjs";

const expectedVersion = process.argv[2];
const packageJson = readJson("package.json");
const manifest = readJson("manifest.json");
const versions = readJson("versions.json");
const issues = getReleaseMetadataIssues({ expectedVersion, manifest, packageJson, versions });

for (const artifact of ["main.js", "manifest.json", "styles.css"]) {
	if (!existsSync(artifact) || statSync(artifact).size === 0) {
		issues.push(`Release artifact is missing or empty: ${artifact}`);
	}
}

if (existsSync("main.js")) {
	const bundle = readFileSync("main.js", "utf8");
	for (const path of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
		if (!existsSync(path)) {
			issues.push(`Required license notice is missing: ${path}`);
		} else if (!bundle.includes(readFileSync(path, "utf8").trim())) {
			issues.push(`The standalone main.js must include the complete notice from ${path}.`);
		}
	}
	if (existsSync("THIRD_PARTY_NOTICES.md")) {
		const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
		for (const dependency of ["ts-fsrs", "zod"]) {
			const path = `node_modules/${dependency}/LICENSE`;
			if (!existsSync(path)) {
				issues.push(`Install dependencies before checking licenses: ${path}`);
			} else if (!notices.includes(readFileSync(path, "utf8").trim())) {
				issues.push(`THIRD_PARTY_NOTICES.md must retain the installed ${dependency} license.`);
			}
		}
	}
}

if (issues.length > 0) {
	for (const issue of issues) console.error(`Release check failed: ${issue}`);
	process.exit(1);
}

console.log(`Release metadata and artifacts are valid for Mneme ${packageJson.version}.`);

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
