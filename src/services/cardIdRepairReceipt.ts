import { z } from "zod/v3";

const pathSchema = z.string().refine((path) => /\.md$/iu.test(path) && !/[\x00-\x1f\x7f\\]/u.test(path)
	&& !/^(?:\/|[a-z]:)/iu.test(path) && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const receiptSchema = z.object({
	version: z.literal(1),
	status: z.enum(["pending", "completed"]),
	oldCardId: z.string().min(1).refine((id) => id.trim() === id && !/[\x00-\x1f\x7f]/u.test(id)),
	newCardId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/),
	path: pathSchema,
	cardIndex: z.number().int().nonnegative(),
	migrateState: z.boolean(),
	beforeHash: z.string().regex(/^[a-f0-9]{64}$/),
	afterHash: z.string().regex(/^[a-f0-9]{64}$/),
	createdAt: z.string().datetime(),
}).strict().refine((r) => r.oldCardId !== r.newCardId && r.beforeHash !== r.afterHash
	&& (!r.migrateState || r.oldCardId === `${r.path}#${r.cardIndex}`));
const recordsSchema = z.record(receiptSchema).refine((records) =>
	Object.entries(records).every(([key, record]) => key === record.newCardId)
	&& Object.values(records).filter((record) => record.status === "pending").length <= 1);

export type CardIdRepairReceipt = z.infer<typeof receiptSchema>;

export function readCardIdRepairs(raw: unknown): Record<string, CardIdRepairReceipt> {
	if (raw === undefined) return {};
	const result = recordsSchema.safeParse(raw);
	if (!result.success) throw new Error("The saved Card ID repair records are invalid. Inspect data.json before repairing IDs.");
	return result.data;
}

export function assertCardIdRepairAllowsCard(raw: unknown, cardId: string): void {
	for (const r of Object.values(readCardIdRepairs(raw))) {
		if ((r.status === "pending" && (r.oldCardId === cardId || r.newCardId === cardId))
			|| (r.status === "completed" && r.migrateState && r.oldCardId === cardId)) {
			throw new Error("Card identity changed or repair is pending. Refresh the view or run Resume Card ID Repair.");
		}
	}
}

export function assertCardIdRepairAllowsPath(raw: unknown, path: string): void {
	if (Object.values(readCardIdRepairs(raw)).some((r) => r.status === "pending" && r.path === path)) {
		throw new Error(`Run Resume Card ID Repair before changing ${path}.`);
	}
}

export function getReservedCardRepairIds(raw: unknown): string[] {
	return Object.values(readCardIdRepairs(raw)).flatMap((r) => r.migrateState ? [r.oldCardId, r.newCardId] : [r.newCardId]);
}
