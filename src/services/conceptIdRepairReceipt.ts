import { z } from "zod/v3";

const pathSchema = z.string().refine((path) => /\.md$/iu.test(path) && !/[\x00-\x1f\x7f\\]/u.test(path)
	&& !/^(?:\/|[a-z]:)/iu.test(path) && path.split("/").every((part) => part !== "" && part !== "." && part !== ".."));
const idSchema = z.string().min(1).refine((id) => id.trim() === id && !/[\x00-\x1f\x7f]/u.test(id));
const fileSchema = z.object({ path: pathSchema, beforeHash: z.string().regex(/^[a-f0-9]{64}$/), afterHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const receiptSchema = z.object({
	version: z.literal(1), status: z.enum(["pending", "completed"]),
	oldConceptId: idSchema.optional(), oldReviewConceptId: idSchema.optional(),
	newConceptId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/),
	concept: fileSchema, cards: fileSchema.optional(), migrateState: z.boolean(), createdAt: z.string().datetime(),
}).strict().refine((r) => r.oldConceptId !== r.newConceptId && r.concept.beforeHash !== r.concept.afterHash
	&& r.concept.path !== r.cards?.path && (!r.oldReviewConceptId || !!r.cards)
	&& (!r.oldConceptId || !r.oldReviewConceptId || r.oldConceptId === r.oldReviewConceptId)
	&& r.migrateState === (!r.oldConceptId && !!r.oldReviewConceptId && r.oldReviewConceptId !== r.newConceptId));

export type ConceptIdRepairReceipt = z.infer<typeof receiptSchema>;

export function assertConceptIdRepairPaths(conceptPath: string, cardsPath?: string): void {
	if (!pathSchema.safeParse(conceptPath).success || (cardsPath !== undefined && !pathSchema.safeParse(cardsPath).success)
		|| conceptPath === cardsPath) throw new Error("Concept ID repair requires distinct relative Markdown paths.");
}

export function readConceptIdRepairs(raw: unknown): Record<string, ConceptIdRepairReceipt> {
	if (raw === undefined) return Object.create(null);
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("The saved Concept ID repair records are invalid.");
	const result: Record<string, ConceptIdRepairReceipt> = Object.create(null);
	for (const [key, value] of Object.entries(raw)) {
		const parsed = receiptSchema.safeParse(value);
		if (!parsed.success || parsed.data.newConceptId !== key) throw new Error("The saved Concept ID repair records are invalid.");
		result[key] = parsed.data;
	}
	if (Object.values(result).filter((r) => r.status === "pending").length > 1) throw new Error("Multiple Concept ID repairs are pending. Inspect data.json.");
	return result;
}

export function assertConceptIdRepairAllowsConcept(raw: unknown, id: string): void {
	for (const r of Object.values(readConceptIdRepairs(raw))) {
		if ((r.status === "pending" && [r.oldConceptId, r.oldReviewConceptId, r.newConceptId].includes(id))
			|| (r.status === "completed" && r.migrateState && r.oldReviewConceptId === id)) {
			throw new Error("Concept identity changed or repair is pending. Refresh the view or run Resume Concept ID Repair.");
		}
	}
}

export function assertConceptIdRepairAllowsPath(raw: unknown, path: string): void {
	if (Object.values(readConceptIdRepairs(raw)).some((r) => r.status === "pending" && (r.concept.path === path || r.cards?.path === path))) {
		throw new Error(`Run Resume Concept ID Repair before changing ${path}.`);
	}
}

export function getReservedConceptRepairIds(raw: unknown): string[] {
	return Object.values(readConceptIdRepairs(raw)).flatMap((r) => r.migrateState ? [r.newConceptId, r.oldReviewConceptId!] : [r.newConceptId]);
}
