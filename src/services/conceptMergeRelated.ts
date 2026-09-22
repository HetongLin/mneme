import type { ConceptSummary } from "../models/conceptLibrary";
import { normalizeVaultPath } from "../utils/markdownPath";
import { parseConceptTitle } from "./conceptMarkdownParser";
import { addRelatedConceptLink, comparableConceptPath, parseRelatedConceptLinks, removeRelatedConceptLink } from "./conceptRelatedLinks";
import { readMarkdownScalar } from "./markdownScalar";
import { MarkdownWriteConflict } from "./markdownWriteTransaction";
import type { ConceptMergeVaultAdapter, ConceptMergeWrite } from "./conceptMergeService";

interface RelatedSnapshot {
	conceptId: string;
	markdown: string;
	path: string;
	title: string;
}

export interface RelatedConceptMergeChecks {
	/** Inventory, Concept identities and authored relationship targets; never persisted. */
	scanSignature: string;
	resolutions: Array<{ sourcePath: string; target: string; resolvedPath?: string }>;
}

type MarkdownSnapshot = { path: string; markdown: string };

function identity(markdown: string, key: string): string | undefined {
	try { return readMarkdownScalar(markdown, key); } catch { return undefined; }
}

function scanSignature(files: MarkdownSnapshot[]): string {
	return JSON.stringify(files.map(({ path, markdown }) => {
		const type = identity(markdown, "mneme_type");
		return [path, type, identity(markdown, "mneme_id"), type === "concept"
			? parseRelatedConceptLinks(markdown).map((link) => link.target).sort() : []];
	}).sort((first, second) => String(first[0]).localeCompare(String(second[0]))));
}

export function assertRelatedConceptResolutionsCurrent(vault: ConceptMergeVaultAdapter, checks: RelatedConceptMergeChecks): void {
	for (const check of checks.resolutions) {
		if (!vault.resolveLinkpath || vault.resolveLinkpath(check.target, check.sourcePath) !== check.resolvedPath) {
			throw new MarkdownWriteConflict(check.sourcePath);
		}
	}
}

export async function assertRelatedConceptMergeCurrent(vault: ConceptMergeVaultAdapter, checks: RelatedConceptMergeChecks): Promise<void> {
	const files: MarkdownSnapshot[] = [];
	for (const file of await vault.listMarkdownFiles()) files.push({ path: file.path, markdown: await vault.read(file.path) });
	if (scanSignature(files) !== checks.scanSignature) throw new MarkdownWriteConflict("Related Concept index");
	// Check all resolutions together after the awaited reads, including skipped neighbors.
	assertRelatedConceptResolutionsCurrent(vault, checks);
}

export async function prepareRelatedConceptMerge(
	vault: ConceptMergeVaultAdapter,
	survivor: ConceptSummary,
	merged: ConceptSummary,
	survivorBefore: string,
	mergedBefore: string,
	preparedSurvivorMarkdown: string,
): Promise<{ relatedConceptsRewired: number; survivorMarkdown: string; writes: ConceptMergeWrite[]; checks: RelatedConceptMergeChecks }> {
	const files: MarkdownSnapshot[] = [];
	const snapshots: RelatedSnapshot[] = [];
	for (const file of await vault.listMarkdownFiles()) {
		const markdown = file.path === survivor.path ? survivorBefore : file.path === merged.path ? mergedBefore : await vault.read(file.path);
		files.push({ path: file.path, markdown });
		const conceptId = identity(markdown, "mneme_id");
		if (identity(markdown, "mneme_type") === "concept" && conceptId) {
			snapshots.push({ conceptId, markdown, path: file.path, title: parseConceptTitle(markdown, file.path) });
		}
	}
	const byPath = new Map(snapshots.map((snapshot) => [comparableConceptPath(snapshot.path), snapshot]));
	const byCanonicalPath = new Map(snapshots.map((snapshot) => [normalizeVaultPath(snapshot.path), snapshot]));
	const resolutions = new Map<string, RelatedConceptMergeChecks["resolutions"][number]>();
	const nativePath = (target: string, sourcePath: string): string | undefined => {
		if (!vault.resolveLinkpath) throw new Error(`Related link [[${target}]] in ${sourcePath} needs link resolution. Refresh or use an explicit vault path before merging.`);
		const resolvedPath = vault.resolveLinkpath(target, sourcePath);
		const key = JSON.stringify([sourcePath, target]);
		const previous = resolutions.get(key);
		if (previous && previous.resolvedPath !== resolvedPath) throw new MarkdownWriteConflict(sourcePath);
		resolutions.set(key, { sourcePath, target, resolvedPath });
		return resolvedPath;
	};
	const isBare = (target: string): boolean => !comparableConceptPath(target).includes("/");
	const resolve = (target: string, sourcePath: string): RelatedSnapshot | undefined => {
		if (!isBare(target)) return byPath.get(comparableConceptPath(target));
		const path = nativePath(target, sourcePath);
		return path === undefined ? undefined : byCanonicalPath.get(normalizeVaultPath(path));
	};
	const isParticipant = (snapshot: RelatedSnapshot | undefined): boolean => !!snapshot
		&& (snapshot.path === survivor.path || snapshot.path === merged.path);
	// Removal is limited to the authored spelling that discovery just selected.
	const sameSpelling = (candidate: string, target: string): boolean => comparableConceptPath(candidate) === comparableConceptPath(target);
	const addConcept = (markdown: string, sourcePath: string, target: Pick<ConceptSummary, "path" | "title">): string => {
		const emitted = normalizeVaultPath(target.path).replace(/\.md$/i, "");
		if (isBare(emitted) && nativePath(emitted, sourcePath) !== target.path) {
			throw new Error(`Related link [[${emitted}]] would resolve to another file in ${sourcePath}. Use an unambiguous Concept path before merging.`);
		}
		return addRelatedConceptLink(markdown, target,
			(candidate) => resolve(candidate, sourcePath)?.path === target.path).markdown;
	};
	const neighbors = new Map<string, RelatedSnapshot>();
	const addNeighbor = (snapshot: RelatedSnapshot): void => {
		const existing = neighbors.get(snapshot.conceptId);
		if (existing && existing.path !== snapshot.path) throw new Error(`Related Concept ID ${snapshot.conceptId} appears in more than one file. Repair it before merging.`);
		neighbors.set(snapshot.conceptId, snapshot);
	};
	let nextSurvivor = preparedSurvivorMarkdown;
	for (const link of parseRelatedConceptLinks(nextSurvivor)) {
		const target = resolve(link.target, survivor.path);
		if (isParticipant(target)) nextSurvivor = removeRelatedConceptLink(nextSurvivor, link.target, sameSpelling).markdown;
		else if (target) addNeighbor(target);
	}
	for (const link of parseRelatedConceptLinks(mergedBefore)) {
		const target = resolve(link.target, merged.path);
		if (target && !isParticipant(target)) addNeighbor(target);
		else if (!target) {
			const emitted = normalizeVaultPath(link.target).replace(/\.md$/i, "");
			if (isBare(link.target) && nativePath(link.target, merged.path) !== nativePath(emitted, survivor.path)) {
				throw new Error(`Related link [[${link.target}]] changes destination from ${merged.path} to ${survivor.path}. Use an explicit vault path before merging.`);
			}
			nextSurvivor = addRelatedConceptLink(nextSurvivor, {
				path: link.target, title: link.display ?? link.target.split("/").pop() ?? link.target,
			}, sameSpelling).markdown;
		}
	}
	for (const snapshot of snapshots) {
		if (isParticipant(snapshot)) continue;
		if (parseRelatedConceptLinks(snapshot.markdown).some((link) => isParticipant(resolve(link.target, snapshot.path)))) addNeighbor(snapshot);
	}
	const writes: ConceptMergeWrite[] = [];
	for (const neighbor of neighbors.values()) {
		let after = neighbor.markdown;
		for (const link of parseRelatedConceptLinks(after)) {
			if (isParticipant(resolve(link.target, neighbor.path))) after = removeRelatedConceptLink(after, link.target, sameSpelling).markdown;
		}
		after = addConcept(after, neighbor.path, survivor);
		nextSurvivor = addConcept(nextSurvivor, survivor.path, neighbor);
		if (after !== neighbor.markdown) writes.push({ after, before: neighbor.markdown, label: "Related Concept Rewire", path: neighbor.path });
	}
	return {
		relatedConceptsRewired: neighbors.size, survivorMarkdown: nextSurvivor, writes,
		checks: { scanSignature: scanSignature(files), resolutions: [...resolutions.values()] },
	};
}
