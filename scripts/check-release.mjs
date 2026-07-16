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

if (issues.length > 0) {
	for (const issue of issues) console.error(`Release check failed: ${issue}`);
	process.exit(1);
}

console.log(`Release metadata and artifacts are valid for Mneme ${packageJson.version}.`);

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}
