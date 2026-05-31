import type {
	ConceptSourceLink,
	ConceptSourceRelationType,
} from "../models/conceptSource";
import type { MnemePluginData } from "../models/reviewState";
import { normalizePluginData } from "./reviewStateStore";

export interface ConceptSourceLinkStorage {
	loadData(): Promise<unknown>;
	saveData(data: MnemePluginData): Promise<void>;
}

export class ConceptSourceLinkStore {
	constructor(private readonly storage: ConceptSourceLinkStorage) {
	}

	async loadLinks(): Promise<Record<string, ConceptSourceLink>> {
		const data = await this.loadPluginData();

		return { ...data.conceptSourceLinks };
	}

	async getLink(id: string): Promise<ConceptSourceLink | undefined> {
		const links = await this.loadLinks();

		return links[id];
	}

	async upsertLink(link: ConceptSourceLink): Promise<void> {
		const data = await this.loadPluginData();

		await this.storage.saveData({
			...data,
			conceptSourceLinks: {
				...data.conceptSourceLinks,
				[link.id]: link,
			},
		});
	}

	async listLinks(): Promise<ConceptSourceLink[]> {
		return Object.values(await this.loadLinks());
	}

	async listApprovedLinks(): Promise<ConceptSourceLink[]> {
		const links = await this.listLinks();

		return links.filter((link) => link.status === "approved");
	}

	async listByConceptId(conceptId: string): Promise<ConceptSourceLink[]> {
		const links = await this.listLinks();

		return links.filter((link) => link.conceptId === conceptId);
	}

	async listBySourcePath(sourcePath: string): Promise<ConceptSourceLink[]> {
		const links = await this.listLinks();

		return links.filter((link) => link.sourcePath === sourcePath);
	}

	async listByRelationType(relationType: ConceptSourceRelationType): Promise<ConceptSourceLink[]> {
		const links = await this.listLinks();

		return links.filter((link) => link.relationType === relationType);
	}

	async clearLinks(): Promise<void> {
		const data = await this.loadPluginData();

		await this.storage.saveData({
			...data,
			conceptSourceLinks: {},
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
