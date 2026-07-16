const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

export function updateReleaseMetadata(manifest, versions, targetVersion) {
	assertVersion(targetVersion, "target version");
	assertVersion(manifest?.minAppVersion, "manifest minAppVersion");

	return {
		manifest: {
			...manifest,
			version: targetVersion,
		},
		versions: {
			...versions,
			[targetVersion]: manifest.minAppVersion,
		},
	};
}

export function getReleaseMetadataIssues({ expectedVersion, manifest, packageJson, versions }) {
	const issues = [];
	const version = packageJson?.version;

	if (!VERSION_PATTERN.test(version ?? "")) issues.push("package.json version must use x.y.z.");
	if (manifest?.id !== "mneme") issues.push("manifest.json id must be mneme.");
	if (manifest?.name !== "Mneme") issues.push("manifest.json name must be Mneme.");
	if (manifest?.version !== version) issues.push("manifest.json and package.json versions must match.");
	if (manifest?.isDesktopOnly !== false) issues.push("Mneme must remain cross-platform, not desktop-only.");
	if (!VERSION_PATTERN.test(manifest?.minAppVersion ?? "")) issues.push("manifest minAppVersion must use x.y.z.");
	if (version && versions?.[version] !== manifest?.minAppVersion) {
		issues.push("versions.json must map the package version to manifest minAppVersion.");
	}
	if (expectedVersion && version !== expectedVersion) {
		issues.push(`Expected release version ${expectedVersion}, found ${version ?? "(missing)"}.`);
	}

	return issues;
}

function assertVersion(value, label) {
	if (!VERSION_PATTERN.test(value ?? "")) {
		throw new Error(`${label} must use x.y.z.`);
	}
}
