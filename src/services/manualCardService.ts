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
	process(path: string, transform: (current: string) => string): Promise<void>;
	read(path: string): Promise<string>;
}

export interface PreparedManualCard extends ManualCardResult {
	markdown: string;
	targetExisted: boolean;
}

export async function createManualCard(
	input: ManualCardInput,
	settings: MnemeSettings,
	vault: ManualCardVault,
	historicalCardIds: ReadonlySet<string> = new Set(),
	createId: () => string = createRandomCardId,
): Promise<ManualCardResult> {
	const prepared = await prepareManualCard(input, settings, vault, historicalCardIds, createId);
	await applyManualCard(prepared, vault);
	return { cardId: prepared.cardId, cardsPath: prepared.cardsPath, conceptId: prepared.conceptId };
}

export async function prepareManualCard(
	input: ManualCardInput,
	settings: MnemeSettings,
	vault: ManualCardVault,
	historicalCardIds: ReadonlySet<string>,
	createId: () => string = createRandomCardId,
): Promise<PreparedManualCard> {
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
	const markdown = renderManualCard({ ...input, front, back, rubric }, cardId);
	if (existing !== undefined) {
		const validation = appendCardGroupDraft(existing, markdown);
		if (validation.status === "invalid") throw new Error(validation.message);
	}
	return { cardId, cardsPath, conceptId: input.concept.conceptId, markdown, targetExisted: existing !== undefined };
}

export function renderManualCard(input: ManualCardInput, cardId: string): string {
	return renderCardGroupMarkdown({
		back: input.back.trim(),
		cardId,
		cardType: input.cardType,
		conceptId: input.concept.conceptId,
		conceptLabel: input.concept.title,
		conceptLink: toObsidianInternalLink(input.concept.path, input.concept.title),
		front: input.front.trim(),
		rubric: input.rubric?.trim(),
	});
}

export async function applyManualCard(prepared: PreparedManualCard, vault: ManualCardVault): Promise<void> {
	const { cardsPath, markdown, targetExisted } = prepared;
	const exists = await vault.exists(cardsPath);
	if (!exists && targetExisted) throw new Error("The Card Group was moved or removed. Restore it before resuming creation.");
	await ensureParentFolders(cardsPath, vault);
	if (!exists) {
		await vault.create(cardsPath, markdown);
	} else {
		await vault.process(cardsPath, (current) => {
			const appendResult = appendCardGroupDraft(current, markdown);
			if (appendResult.status === "invalid") throw new Error(appendResult.message);
			return appendResult.markdown;
		});
	}
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
