import assert from "node:assert/strict";
import {
	getReleaseMetadataIssues,
	updateReleaseMetadata,
} from "./release-metadata.mjs";

const manifest = {
	id: "mneme",
	isDesktopOnly: false,
	minAppVersion: "1.5.0",
	name: "Mneme",
	version: "0.1.0",
};
const packageJson = { version: "1.0.0" };
const updated = updateReleaseMetadata(manifest, { "0.1.0": "1.5.0" }, "1.0.0");

assert.equal(updated.manifest.version, "1.0.0");
assert.deepEqual(updated.versions, {
	"0.1.0": "1.5.0",
	"1.0.0": "1.5.0",
});
assert.deepEqual(getReleaseMetadataIssues({
	expectedVersion: "1.0.0",
	manifest: updated.manifest,
	packageJson,
	versions: updated.versions,
}), []);
assert.match(getReleaseMetadataIssues({
	manifest: { ...updated.manifest, isDesktopOnly: true },
	packageJson,
	versions: updated.versions,
}).join(" "), /cross-platform/);
assert.throws(() => updateReleaseMetadata(manifest, {}, "v1"), /x\.y\.z/);

console.log("Release metadata tests passed.");
