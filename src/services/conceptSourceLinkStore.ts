import type {
	ConceptSourceLink,
	ConceptSourceRelationType,
} from "../models/conceptSource";
import type { MnemePluginData } from "../models/reviewState";
import { runPluginDataMutation } from "./pluginDataMutation";
import { normalizePluginData } from "./reviewStateStore";
import { readConceptIdRepairs } from "./conceptIdRepairReceipt";

export interface ConceptSourceLinkReconciliationChange {
	expected: ConceptSourceLink;
	action: "remove" | "remove_missing_concept" | "mark_stale";
}

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
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

			await this.storage.saveData({
				...data,
				conceptSourceLinks: {
					...data.conceptSourceLinks,
					[link.id]: link,
				},
			});
		});
	}

	/** A stale scan must not undo relinking, explicit removal, or newly saved provenance. */
	async reconcileLinksIfUnchanged(
		changes: ConceptSourceLinkReconciliationChange[],
	): Promise<{ removedLinks: ConceptSourceLink[]; staleLinkIds: string[]; deferredLinkIds: string[] }> {
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();
			// Inspect current receipts inside the queue: repair may have finished after the scan.
			// A receipt records identity changes, not permission to discard or reassign provenance.
			const repairConceptIds = new Set(Object.values(readConceptIdRepairs(data.conceptIdRepairs))
				.flatMap((receipt) => [receipt.oldConceptId, receipt.oldReviewConceptId, receipt.newConceptId]));
			const links = { ...data.conceptSourceLinks };
			const removedLinks: ConceptSourceLink[] = [];
			const staleLinkIds: string[] = [];
			const deferredLinkIds: string[] = [];
			for (const { expected, action } of changes) {
				const current = links[expected.id];
				if (!current || JSON.stringify(current) !== JSON.stringify(expected)) continue;
				if (action === "remove_missing_concept" && repairConceptIds.has(current.conceptId)) {
					deferredLinkIds.push(current.id);
					continue;
				}
				if (action === "remove" || action === "remove_missing_concept") {
					delete links[current.id];
					removedLinks.push(current);
				} else if (current.status === "approved") {
					links[current.id] = { ...current, status: "stale" };
					staleLinkIds.push(current.id);
				}
			}
			if (removedLinks.length > 0 || staleLinkIds.length > 0) {
				await this.storage.saveData({ ...data, conceptSourceLinks: links });
			}
			return { removedLinks, staleLinkIds, deferredLinkIds };
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
		return runPluginDataMutation(this.storage, async () => {
			const data = await this.loadPluginData();

			await this.storage.saveData({
				...data,
				conceptSourceLinks: {},
			});
		});
	}

	private async loadPluginData(): Promise<MnemePluginData> {
		return normalizePluginData(await this.storage.loadData());
	}
}
