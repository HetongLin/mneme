export type ReviewActionKind = "rating" | "more";

export interface ReviewActionToken {
	readonly session: number;
	readonly sequence: number;
	readonly kind: ReviewActionKind;
	readonly cardId: string;
}

/** Coordinates asynchronous actions within one ReviewView session. */
export class ReviewActionGuard {
	private action: ReviewActionToken | undefined;
	private nextSequence = 0;
	private session = 0;

	get isBusy(): boolean {
		return this.action !== undefined;
	}

	beginSession(): void {
		this.session += 1;
	}

	begin(kind: ReviewActionKind, cardId: string): ReviewActionToken | undefined {
		if (this.action) return undefined;
		const token: ReviewActionToken = {
			session: this.session,
			sequence: ++this.nextSequence,
			kind,
			cardId,
		};
		this.action = token;
		return token;
	}

	isCurrent(token: ReviewActionToken): boolean {
		return this.action === token && token.session === this.session;
	}

	finish(token: ReviewActionToken): void {
		if (this.action === token) this.action = undefined;
	}
}
