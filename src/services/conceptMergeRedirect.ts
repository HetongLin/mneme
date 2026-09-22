import type { ConceptSummary } from "../models/conceptLibrary";
import { toObsidianInternalLink } from "../utils/markdownPath";
import { collectScalarLines, type ScalarLine } from "./markdownScalar";

/** Retire the identity while keeping the original note at its original path. */
export function renderConceptRedirect(
	markdown: string,
	survivor: ConceptSummary,
	merged: ConceptSummary,
	mergedAt: string,
): string {
	const header = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
	if (!header) throw new Error("Markdown frontmatter is required for Guided Merge.");
	const yaml = header[2] ?? "";
	const newline = markdown.startsWith("---\r\n") ? "\r\n" : "\n";
	for (const key of ["former_mneme_id", "merged_into", "merged_at", "redirect_to"]) {
		if (collectScalarLines(yaml, key).length) {
			throw new Error(`Concept already contains ${key}. Review its redirect metadata before merging.`);
		}
	}
	const type = managedScalar(yaml, "mneme_type");
	const id = managedScalar(yaml, "mneme_id");
	const version = managedScalar(yaml, "mneme_version");
	if (type?.value !== "concept" || id?.value !== merged.conceptId) {
		throw new Error("Concept identity changed. Refresh Concept Library before merging.");
	}
	const edits = [
		{ start: type.valueStart, end: type.valueEnd, value: "concept_redirect" },
		// Rename only the key, retaining the original ID spelling and its comment.
		{ start: id.start, end: id.valueStart, value: `former_mneme_id${id.prefix.slice(id.prefix.indexOf(":"))}` },
	];
	if (version) {
		// Include spacing when replacing an empty scalar immediately before a comment.
		edits.push({ start: version.valueStart, end: version.valueEnd, value: yaml[version.valueEnd] === "#" ? "1 " : "1" });
	}
	let nextYaml = yaml;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		nextYaml = nextYaml.slice(0, edit.start) + edit.value + nextYaml.slice(edit.end);
	}
	const link = toObsidianInternalLink(survivor.path, survivor.title);
	nextYaml += newline + [
		...(!version ? ["mneme_version: 1"] : []),
		`merged_into: ${JSON.stringify(survivor.conceptId)}`,
		`merged_at: ${JSON.stringify(mergedAt)}`,
		`redirect_to: ${JSON.stringify(link)}`,
	].join(newline);
	const closing = header[3] ?? "";
	const notice = [
		"", "> [!info] Merged Concept",
		`> This Concept was merged into ${link}.`,
		"> The original note is retained below for reference.", "", "",
	].join(newline);
	return (header[1] ?? "") + nextYaml + closing + (closing.endsWith("\n") ? "" : newline)
		+ notice + markdown.slice((header[0] ?? "").length);
}

function managedScalar(yaml: string, key: string): ScalarLine | undefined {
	const matches = collectScalarLines(yaml, key);
	const field = matches[0];
	if (matches.length > 1 || field?.invalid) {
		throw new Error(`${key} must be a single plain or quoted scalar before merging.`);
	}
	if (field) {
		// A one-line replacement must not leave an indented value attached to it.
		const following = yaml.slice(field.end).split(/\r?\n/).slice(1)
			.find((line) => line.trim() && !line.trimStart().startsWith("#"));
		if (following && /^(?:[ \t]|-(?:[ \t]|$))/.test(following)) {
			throw new Error(`${key} must not have a multiline value before merging.`);
		}
	}
	return field;
}
