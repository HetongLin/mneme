import { App, TFile } from "obsidian";
import type { ConceptVaultAdapter, ConceptVaultFile } from "./conceptScanner";

export class ObsidianConceptVaultAdapter implements ConceptVaultAdapter {
	constructor(private readonly app: App) {
	}

	resolveLinkpath(linkpath: string, sourcePath: string): string | undefined {
		return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path;
	}

	async listMarkdownFiles(): Promise<ConceptVaultFile[]> {
		return this.app.vault.getMarkdownFiles().map((file) => ({
			mtime: file.stat.mtime,
			path: file.path,
		}));
	}

	async getFrontmatter(path: string): Promise<unknown | undefined> {
		return this.app.metadataCache.getCache(path)?.frontmatter;
	}

	async readMarkdown(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);

		if (!(file instanceof TFile)) {
			throw new Error(`Markdown file not found: ${path}`);
		}

		return this.app.vault.cachedRead(file);
	}
}
