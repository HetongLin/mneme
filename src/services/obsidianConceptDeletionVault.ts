import { TFile, Vault } from "obsidian";
import type { MetadataCache } from "obsidian";
import type { RecoverableConceptDeletionVault } from "./recoverableConceptDeletion";

/** Disk reads and local trash are available at our minimum Obsidian version (1.5). */
export class ObsidianConceptDeletionVault implements RecoverableConceptDeletionVault {
	constructor(private readonly vault: Vault, private readonly metadataCache?: MetadataCache) {}
	resolveLinkpath(linkpath: string, sourcePath: string): string | undefined {
		return this.metadataCache?.getFirstLinkpathDest(linkpath, sourcePath)?.path;
	}
	async exists(path: string): Promise<boolean> {
		return this.vault.getAbstractFileByPath(path) !== null;
	}
	async read(path: string): Promise<string> { return this.vault.read(this.file(path)); }
	async process(path: string, transform: (current: string) => string): Promise<void> {
		await this.vault.process(this.file(path), transform);
	}
	async rename(path: string, destination: string): Promise<void> {
		if (await this.exists(destination)) throw new Error(`Deletion staging path is occupied: ${destination}`);
		// Vault.rename deliberately avoids FileManager's automatic link rewriting.
		await this.vault.rename(this.file(path), destination);
	}
	async trash(path: string): Promise<void> { await this.vault.trash(this.file(path), false); }
	private file(path: string): TFile {
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Deletion file was not found: ${path}`);
		return file;
	}
}
