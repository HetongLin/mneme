import { readFileSync, writeFileSync } from "fs";
import { updateReleaseMetadata } from "./scripts/release-metadata.mjs";

const targetVersion = process.env.npm_package_version;
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
const updated = updateReleaseMetadata(manifest, versions, targetVersion);

writeFileSync("manifest.json", `${JSON.stringify(updated.manifest, null, "\t")}\n`);
writeFileSync("versions.json", `${JSON.stringify(updated.versions, null, "\t")}\n`);
