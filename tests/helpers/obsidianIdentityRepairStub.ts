export { App, Modal, Notice, TFile } from "./obsidianCardDeleteStub";
// Fixture registry isolates UI plumbing from Obsidian's own YAML implementation.
export const yamlFixtures = new Map<string, unknown>();
export function parseYaml(yaml: string): unknown {
	if (!yamlFixtures.has(yaml)) throw new Error("Unexpected YAML fixture");
	return structuredClone(yamlFixtures.get(yaml));
}
