import { z } from "zod/v3";

const hash64 = z.string().regex(/^[a-f0-9]{64}$/);
const operationId = z.string().regex(/^[A-Za-z0-9-]+$/).min(1);
const safeRelativePath = z.string().refine((value) => {
	if (!value || /[\x00-\x1f\x7f]/.test(value) || value.includes("\\") || /^(?:\/|[a-z]:)/i.test(value)) return false;
	const parts = value.split("/");
	return parts.every((part) => part !== "" && part !== "." && part !== "..");
}, "Expected a safe relative vault path.");
const vaultPath = safeRelativePath.refine((value) => /\.md$/i.test(value), "Expected a Markdown vault path.");
const cardId = z.string().min(1).refine((value) => value.trim() === value && !/[\s<>"']/.test(value));

const pendingFile = z.object({
	path: vaultPath,
	stagePath: safeRelativePath,
	hash: hash64,
	phase: z.enum(["planned", "staged", "trashed"]),
}).strict();

const relatedFile = z.object({
	path: vaultPath,
	beforeHash: hash64,
	afterHash: hash64,
}).strict();

const pendingSchema = z.object({
	version: z.literal(1),
	status: z.literal("pending"),
	operationId,
	conceptId: cardId,
	createdAt: z.string().datetime(),
	conceptPath: vaultPath,
	cardIds: z.array(cardId),
	files: z.array(pendingFile).min(1).max(2),
	related: z.array(relatedFile),
}).strict().superRefine((value, context) => {
	if (new Set(value.cardIds).size !== value.cardIds.length) {
		context.addIssue({ code: "custom", path: ["cardIds"], message: "Card IDs must be unique." });
	}
	const paths = [...value.files.map((file) => file.path), ...value.related.map((file) => file.path)];
	if (new Set(paths).size !== paths.length) {
		context.addIssue({ code: "custom", path: ["files"], message: "Deletion paths must be unique." });
	}
	if (!value.files.some((file) => file.path === value.conceptPath)) {
		context.addIssue({ code: "custom", path: ["files"], message: "Deletion files must include conceptPath." });
	}
	for (const file of value.files) {
		if (file.stagePath !== `${file.path}.mneme-delete-${value.operationId}`) {
			context.addIssue({ code: "custom", path: ["files"], message: "Invalid deletion staging path." });
		}
	}
});

const deletedSchema = z.object({
	version: z.literal(1),
	status: z.literal("deleted"),
	operationId,
	conceptId: cardId,
	createdAt: z.string().datetime(),
	completedAt: z.string().datetime(),
	conceptPath: vaultPath,
}).strict();

const receiptSchema = z.union([pendingSchema, deletedSchema]);

export type PendingConceptDeletionReceipt = z.infer<typeof pendingSchema>;
export type ConceptDeletionReceipt = z.infer<typeof receiptSchema>;

export function readConceptDeletions(raw: unknown): Record<string, ConceptDeletionReceipt> {
	if (raw === undefined) return Object.create(null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("The saved Concept deletion journal is invalid.");
	}

	const result: Record<string, ConceptDeletionReceipt> = Object.create(null);
	let pendingCount = 0;
	for (const [key, value] of Object.entries(raw)) {
		const parsed = receiptSchema.safeParse(value);
		if (!parsed.success || parsed.data.conceptId !== key) {
			throw new Error("The saved Concept deletion journal is invalid.");
		}
		if (parsed.data.status === "pending") pendingCount += 1;
		result[key] = parsed.data;
	}
	if (pendingCount > 1) throw new Error("The saved Concept deletion journal has multiple pending operations.");
	return result;
}

export function assertConceptNotDeleting(raw: unknown, conceptId: string): void {
	const receipt = readConceptDeletions(raw)[conceptId];
	if (receipt) throw new Error(`Concept deletion is already ${receipt.status}: ${conceptId}`);
}

export function assertCardNotDeleting(raw: unknown, cardIdValue: string): void {
	const deletions = readConceptDeletions(raw);
	if (Object.values(deletions).some((receipt) => (
		receipt.status === "pending" && receipt.cardIds.includes(cardIdValue)
	))) {
		throw new Error(`Card deletion is pending: ${cardIdValue}`);
	}
}
