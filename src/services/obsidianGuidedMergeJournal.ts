import type { DataAdapter } from "obsidian";
import type { GuidedMergeJournal } from "./guidedConceptMergeRecovery";

/** The plugin's hidden directory keeps recovery copies out of Vault content scans. */
export class ObsidianGuidedMergeJournal implements GuidedMergeJournal {
	constructor(private readonly adapter: Pick<DataAdapter, "exists" | "read" | "write" | "mkdir" | "remove">,
		private readonly pluginDirectory: string) {}

	private path(operationId: string): string {
		if (!/^[a-zA-Z0-9_-]+$/.test(operationId)) throw new Error("Invalid Guided Merge operation ID.");
		if (!this.pluginDirectory || /[\x00-\x1f\x7f\\]/.test(this.pluginDirectory)
			|| this.pluginDirectory.split("/").some((part) => !part || part === "." || part === "..")
			|| /^(?:[\\/]|[a-z]:)/i.test(this.pluginDirectory)) throw new Error("The plugin recovery directory is unavailable.");
		return `${this.pluginDirectory}/guided-merge-recovery/${operationId}.json`;
	}

	async read(operationId: string): Promise<string> { return this.adapter.read(this.path(operationId)); }

	async write(operationId: string, contents: string): Promise<void> {
		const path = this.path(operationId);
		const directory = path.slice(0, path.lastIndexOf("/"));
		if (!await this.adapter.exists(directory)) await this.adapter.mkdir(directory);
		if (await this.adapter.exists(path)) {
			if (await this.adapter.read(path) !== contents) throw new Error("Guided Merge recovery snapshots already exist with different content.");
			return;
		}
		await this.adapter.write(path, contents);
	}

	async remove(operationId: string): Promise<void> {
		const path = this.path(operationId);
		if (await this.adapter.exists(path)) await this.adapter.remove(path);
	}
}
