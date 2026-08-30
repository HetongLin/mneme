export type AiOperationStage = "preparing" | "requesting" | "validating" | "saving";

export interface AiOperationProgress {
	message: string;
	stage: AiOperationStage;
}

export type AiOperationProgressListener = (progress: AiOperationProgress) => void;

export function reportAiOperationProgress(
	listener: AiOperationProgressListener | undefined,
	stage: AiOperationStage,
	message: string,
): void {
	listener?.({ message, stage });
}
