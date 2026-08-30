import type { ConceptSummary } from "../models/conceptLibrary";
import { CARD_DRAFT_TYPES, type CardDraftType } from "../models/knowledgeProposal";
import type { MnemeSettings } from "../models/settings";
import { buildCardGroupPath, normalizeVaultPath, toObsidianInternalLink } from "../utils/markdownPath";
import { appendCardGroupDraft } from "./cardGroupWriter";
import { parseMnemeCards } from "./cardMarkerParser";
import { createRandomCardId } from "./entityId";
import { renderCardGroupMarkdown } from "./markdownProposalRenderer";

export interface ManualCardInput {
	back: string;
	cardType: CardDraftType;
	concept: ConceptSummary;
	front: string;
	rubric?: string;
}

export interface ManualCardResult {
	cardId: string;
	cardsPath: string;
	conceptId: string;
}

export interface ManualCardVault {
	create(path: string, content: string): Promise<void>;
	createFolder(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	modify(path: string, content: string): Promise<void>;
	read(path: string): Promise<string>;
}

export async function createManualCard(
	input: ManualCardInput,
	settings: MnemeSettings,
	vault: ManualCardVault,
	historicalCardIds: ReadonlySet<string> = new Set(),
	createId: () => string = createRandomCardId,
): Promise<ManualCardResult> {
	const front = input.front.trim();
	const back = input.back.trim();
	const rubric = input.rubric?.trim();
	if (!front) throw new Error("Front is required.");
	if (!back) throw new Error("Back is required.");
	if (!CARD_DRAFT_TYPES.includes(input.cardType)) throw new Error("Select a valid Card Type.");

	const cardsPath = resolveCardGroupPath(input.concept, settings);
	const existing = await readExistingCardGroup(cardsPath, vault);
	const reservedIds = new Set(historicalCardIds);
	for (const cardId of parseMnemeCards(existing ?? "")
		.flatMap((card) => card.explicitCardId ? [card.explicitCardId] : [])) {
		reservedIds.add(cardId);
	}
	let cardId = createId();
	for (let attempt = 0; reservedIds.has(cardId); attempt += 1) {
		if (attempt >= 127) {
			throw new Error("No available random Card ID could be allocated.");
		}
		cardId = createId();
	}
	const draft = renderCardGroupMarkdown({
		back,
		cardId,
		cardType: input.cardType,
		conceptId: input.concept.conceptId,
		conceptLabel: input.concept.title,
		conceptLink: toObsidianInternalLink(input.concept.path, input.concept.title),
		front,
		rubric,
	});

	await ensureParentFolders(cardsPath, vault);
	if (existing === undefined) {
		await vault.create(cardsPath, draft);
	} else {
		const appendResult = appendCardGroupDraft(existing, draft);
		if (appendResult.status === "invalid") throw new Error(appendResult.message);
		if (appendResult.status === "appended") await vault.modify(cardsPath, appendResult.markdown);
	}

	return { cardId, cardsPath, conceptId: input.concept.conceptId };
}

function resolveCardGroupPath(concept: ConceptSummary, settings: MnemeSettings): string {
	const declared = concept.cardsPath ? normalizeVaultPath(concept.cardsPath) : undefined;
	if (declared) {
		if (/\.md$/i.test(declared)) return /(?:^|\/)Card\.md$/i.test(declared)
			? declared.replace(/Card\.md$/i, "Cards.md")
			: declared;
		return `${declared}/Cards.md`;
	}

	const stem = normalizeVaultPath(concept.path).split("/").pop()?.replace(/\.md$/i, "") || concept.title;
	return buildCardGroupPath(settings.cardsFolder, stem);
}

async function readExistingCardGroup(path: string, vault: ManualCardVault): Promise<string | undefined> {
	return await vault.exists(path) ? vault.read(path) : undefined;
}

async function ensureParentFolders(path: string, vault: ManualCardVault): Promise<void> {
	const parts = normalizeVaultPath(path).split("/");
	parts.pop();
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!(await vault.exists(current))) await vault.createFolder(current);
	}
}
