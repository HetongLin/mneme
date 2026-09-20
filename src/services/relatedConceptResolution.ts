import { normalizeVaultPath } from "../utils/markdownPath";
import { comparableConceptPath, type RelatedConceptTargetMatcher } from "./conceptRelatedLinks";

export interface RelatedConceptResolver {
	resolveLinkpath?(linkpath: string, sourcePath: string): string | undefined;
}

/** Qualified locators retain exact matching; bare links require their source context. */
export function createRelatedConceptMatcher(vault: RelatedConceptResolver, sourcePath: string): RelatedConceptTargetMatcher {
	return (candidate, targetPath) => {
		const candidateKey = comparableConceptPath(candidate);
		const targetKey = comparableConceptPath(targetPath);
		if (candidateKey.includes("/")) return candidateKey === targetKey;

		const resolved = vault.resolveLinkpath?.(candidate, sourcePath);
		if (resolved !== undefined) {
			// Resolved paths are canonical; do not fold distinct files' case here.
			return normalizeVaultPath(resolved) === normalizeVaultPath(targetPath);
		}
		if (candidateKey !== targetKey.split("/").pop()) return false;
		throw new Error(`Cannot resolve Related link [[${candidate}]] in ${sourcePath}. Use an explicit vault path before changing this relationship.`);
	};
}
