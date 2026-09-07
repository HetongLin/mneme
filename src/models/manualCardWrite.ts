/** Recovery metadata only. Pending prose stays in the existing Composer draft. */
export interface ManualCardWriteReceipt {
	version: 1;
	draftId: string;
	inputHash: string;
	conceptId: string;
	conceptTitle: string;
	conceptPath: string;
	cardId: string;
	cardsPath: string;
	targetExisted: boolean;
	afterHash: string;
	createdAt: string;
	status: "pending" | "written";
}
