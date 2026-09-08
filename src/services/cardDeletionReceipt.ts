import { z } from "zod/v3";

const hash64 = z.string().regex(/^[a-f0-9]{64}$/);
const cardId = z.string().min(1).refine(
	(value) => value.trim() === value && !/[\s<>"']/u.test(value),
	"Expected a valid Card id.",
);
const vaultPath = z.string().refine((value) => {
	if (!value || /[\x00-\x1f\x7f]/u.test(value) || value.includes("\\") || /^(?:\/|[a-z]:)/iu.test(value)) return false;
	const parts = value.split("/");
	return parts.every((part) => part !== "" && part !== "." && part !== "..");
}, "Expected a safe relative vault path.").refine(
	(value) => /\.md$/iu.test(value),
	"Expected a Markdown vault path.",
);

const receiptSchema = z.object({
	version: z.literal(1),
	cardId,
	path: vaultPath,
	beforeHash: hash64,
	afterHash: hash64,
	createdAt: z.string().datetime(),
}).strict().refine((value) => value.beforeHash !== value.afterHash, {
	message: "Card deletion hashes must differ.",
});

export type CardDeletionReceipt = z.infer<typeof receiptSchema>;

export function readCardDeletion(raw: unknown): CardDeletionReceipt | undefined {
	if (raw === undefined) return undefined;
	const parsed = receiptSchema.safeParse(raw);
	if (!parsed.success) throw new Error("The saved Card deletion receipt is invalid.");
	return parsed.data;
}

export function assertCardDeletionAllowsCard(raw: unknown, cardIdValue: string): void {
	const receipt = readCardDeletion(raw);
	if (receipt?.cardId === cardIdValue) {
		throw new Error(`Card deletion is pending: ${cardIdValue}`);
	}
}

export function assertCardDeletionAllowsPath(raw: unknown, path: string): void {
	const receipt = readCardDeletion(raw);
	if (receipt?.path === path) {
		throw new Error(`Card deletion is pending for path: ${path}`);
	}
}
