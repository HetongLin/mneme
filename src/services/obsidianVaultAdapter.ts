import { TFile, Vault, normalizePath, parseYaml } from "obsidian";
import type { MetadataCache } from "obsidian";
import type { MnemeVaultAdapter } from "./approvedProposalWriter";
import type { VaultStateAdapter, VaultStateFile } from "./vaultStateReconciler";
import type { SourceRelinkFileSnapshot } from "./sourceProvenanceRelinkService";

export class ObsidianVaultAdapter implements MnemeVaultAdapter, VaultStateAdapter {
	constructor(private readonly vault: Vault, private readonly metadataCache?: MetadataCache) {
	}

	resolveLinkpath(linkpath: string, sourcePath: string): string | undefined {
		return this.metadataCache?.getFirstLinkpathDest(linkpath, sourcePath)?.path;
	}

	async exists(path: string): Promise<boolean> {
		return this.vault.getAbstractFileByPath(normalizePath(path)) !== null;
	}

	async createFolder(path: string): Promise<void> {
		const normalizedPath = normalizePath(path);

		if (this.vault.getAbstractFileByPath(normalizedPath)) {
			return;
		}

		await this.vault.createFolder(normalizedPath);
	}

	async create(path: string, content: string): Promise<void> {
		await this.vault.create(normalizePath(path), content);
	}

	async append(path: string, content: string): Promise<void> {
		const file = this.getFile(path);

		await this.vault.append(file, content);
	}

	parseFrontmatter(markdown: string): unknown {
		const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
		return match ? parseYaml(match[1] ?? "") : undefined;
	}

	async readFresh(path: string): Promise<string> {
		return this.vault.read(this.getFile(path));
	}

	async read(path: string): Promise<string> {
		const file = this.getFile(path);

		return this.vault.cachedRead(file);
	}

	async readSnapshot(path: string): Promise<SourceRelinkFileSnapshot> {
		const file = this.getFile(path);

		return {
			content: await this.vault.cachedRead(file),
			mtime: file.stat.mtime,
			path: file.path,
			size: file.stat.size,
		};
	}

	async modify(path: string, content: string): Promise<void> {
		const file = this.getFile(path);

		await this.vault.modify(file, content);
	}

	async process(path: string, transform: (current: string) => string): Promise<void> {
		await this.vault.process(this.getFile(path), transform);
	}

	async listMarkdownFiles(): Promise<VaultStateFile[]> {
		return this.vault.getMarkdownFiles().map((file) => ({
			path: file.path,
		}));
	}

	private getFile(path: string): TFile {
		const abstractFile = this.vault.getAbstractFileByPath(normalizePath(path));

		if (!(abstractFile instanceof TFile)) {
			throw new Error(`Markdown file not found: ${path}`);
		}

		return abstractFile;
	}
}
