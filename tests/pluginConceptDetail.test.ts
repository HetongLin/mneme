import assert from "node:assert/strict";
import MnemePlugin from "../src/main";
import { ConceptEditModal, type ConceptEditModalOptions } from "../src/modals/conceptEditModal";
import type { ConceptSummary } from "../src/models/conceptLibrary";

type PluginLike = {
	app: object;
	settings: { fsrsRequestRetention: number };
	openCardComposerView(conceptId: string): void;
	deleteConcept(concept: ConceptSummary): Promise<void>;
	refreshOpenConceptLibraryViews(): void;
};

function concept(overrides: Partial<ConceptSummary> = {}): ConceptSummary {
	return {
		conceptId: "concept-1",
		path: "Concepts/Current.md",
		title: "Current",
		cardsPath: "Cards/Current",
		relatedConceptIds: ["related-current"],
		...overrides,
	};
}

function makePlugin(): PluginLike {
	const plugin = Object.create(MnemePlugin.prototype) as PluginLike;
	plugin.app = {};
	plugin.settings = { fsrsRequestRetention: 0.9 };
	plugin.openCardComposerView = () => {};
	plugin.deleteConcept = async () => {};
	plugin.refreshOpenConceptLibraryViews = () => {};
	return plugin;
}

async function openConceptDetail(
	plugin: PluginLike,
	staleConcept: ConceptSummary,
	currentConcepts: ConceptSummary[],
): Promise<ConceptEditModalOptions | undefined> {
	let opened: ConceptEditModalOptions | undefined;
	const originalOpen = ConceptEditModal.prototype.open;
	ConceptEditModal.prototype.open = function(this: ConceptEditModal): void {
		opened = (this as unknown as { options: ConceptEditModalOptions }).options;
	};
	try {
		await Promise.resolve((MnemePlugin.prototype as unknown as {
			openConceptDetail(
				concept: ConceptSummary,
				concepts: ConceptSummary[],
			): Promise<void> | void;
		}).openConceptDetail.call(plugin, staleConcept, currentConcepts));
		return opened;
	} finally {
		ConceptEditModal.prototype.open = originalOpen;
	}
}

async function run(): Promise<void> {
	{
		const fresh = concept({
			coreMeaning: "fresh meaning",
			cardsPath: "Cards/Fresh",
			relatedConceptIds: ["fresh-related"],
			title: "Fresh title",
		});
		const stale = concept({
			coreMeaning: "stale meaning",
			cardsPath: "Cards/Stale",
			relatedConceptIds: ["stale-related"],
			title: "Stale title",
		});
		const freshConcepts = [fresh, concept({ conceptId: "other", path: "Concepts/Other.md", title: "Other" })];
		const plugin = makePlugin();
		const opened = await openConceptDetail(plugin, stale, freshConcepts);
		assert.ok(opened, "a current Concept with the same identity should open");
		assert.strictEqual(opened?.concept, fresh, "the modal must receive the freshly scanned object");
		assert.strictEqual(opened?.concepts, freshConcepts, "the modal must receive the fresh Concept list");

		let createdCardFor: string | undefined;
		let deletedConcept: ConceptSummary | undefined;
		plugin.openCardComposerView = (conceptId) => { createdCardFor = conceptId; };
		plugin.deleteConcept = async (candidate) => { deletedConcept = candidate; };
		await opened?.createCard?.();
		await opened?.deleteConcept?.();
		assert.equal(createdCardFor, fresh.conceptId, "create-card must use the fresh Concept identity");
		assert.strictEqual(deletedConcept, fresh, "delete must use the fresh Concept object");
	}

	for (const [label, freshConcepts] of [
		["deleted", []],
		["moved", [concept({ path: "Concepts/Moved.md" })]],
		["id changed", [concept({ conceptId: "concept-2" })]],
	] as const) {
		const stale = concept();
		const opened = await openConceptDetail(makePlugin(), stale, [...freshConcepts]);
		assert.equal(opened, undefined, `${label} Concept must not open from a stale summary`);
	}
}

export const done = run();
