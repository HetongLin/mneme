import assert from "node:assert/strict";
import type { MnemePluginData } from "../src/models/reviewState";
import { DEFAULT_SETTINGS } from "../src/models/settings";
import type { AiProposalRequest, AiProposalResponse, AiProvider } from "../src/services/aiProvider";
import { createAiCardGenerationFingerprint } from "../src/services/aiCaptureFingerprint";
import { AiCardGenerationService } from "../src/services/aiCardGenerationService";
import { AiGenerationLock } from "../src/services/aiGenerationLock";
import { resolveGroundingQuote } from "../src/services/proposalGroundingReconciler";
import { extractConceptLearningContent } from "../src/services/conceptLearningContent";
import { KnowledgeProposalStore } from "../src/services/knowledgeProposalStore";
import { MockAiProvider } from "../src/services/mockAiProvider";
import { SourceAnalysisStore } from "../src/services/sourceAnalysisStore";
import { computeContentHash } from "../src/utils/sourceHash";

const concept = {
	conceptId: "concept-encapsulation",
	conceptPath: "Mneme/Concepts/Encapsulation/Concept.md",
	conceptTitle: "Encapsulation",
	markdown: "# Encapsulation\n\n## Core Meaning\n\nEncapsulation protects representation behind a stable interface.",
};

async function run(): Promise<void> {
	{
		const source = "Bayes theorem uses $P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}$ to update beliefs.";
		const quote = "Bayes theorem uses P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)} to update beliefs.";

		assert.equal(resolveGroundingQuote(source, quote), source);
	}

	{
		const source = "Bayes theorem:\n\n$$\nP(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}\n$$";
		const quote = "Bayes theorem: P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}";

		assert.equal(resolveGroundingQuote(source, quote), source);
	}

	{
		const bayesConcept = {
			conceptId: "concept-bayes",
			conceptPath: "Mneme/Concepts/Bayes-Theorem.md",
			conceptTitle: "Bayes Theorem",
			markdown: "# Bayes Theorem\n\n## Core Meaning\n\nBayes theorem uses $P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}$ to update beliefs.",
		};
		const learningContent = extractConceptLearningContent(bayesConcept.markdown, bayesConcept.conceptPath);
		const conceptHash = await computeContentHash(learningContent);
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [{
				confidence: 0.9,
				evidence: [{
					explanation: "Grounded in the approved Core Meaning.",
					quote: "Bayes theorem uses P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)} to update beliefs.",
					sourcePath: bayesConcept.conceptPath,
				}],
				kind: "new_card",
				payload: {
					back: "$P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}$.",
					cardType: "definition",
					conceptId: bayesConcept.conceptId,
					conceptTitle: bayesConcept.conceptTitle,
					front: "What relationship does Bayes theorem express?",
					rubric: "States the posterior relationship.",
				},
				rationale: "Tests the central equation.",
				title: "Bayes relationship",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: bayesConcept.conceptPath },
			warnings: [],
		};

		const result = await fixture.service.generate(bayesConcept);
		const proposals = await fixture.proposalStore.listProposals();

		assert.equal(result.status, "generated");
		assert.equal(result.proposalCount, 1);
		assert.deepEqual(result.proposalIds, proposals.map((proposal) => proposal.id));
		assert.equal(proposals[0]?.evidence[0]?.excerpt, "Bayes theorem uses $P(h \\mid D)=\\frac{P(D \\mid h)P(h)}{P(D)}$ to update beliefs.");
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: false });
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "ai_disabled");
		assert.equal(fixture.provider.callCount, 0);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const result = await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "generated");
		assert.equal(result.proposalCount, 1);
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(proposals.length, 1);
		assert.equal(proposals[0]?.kind, "new_card");
		assert.equal(proposals[0]?.conceptId, concept.conceptId);
		assert.equal(proposals[0]?.cardId, "card-22222222");
		assert.equal(proposals[0]?.sourcePath, concept.conceptPath);
		assert.equal(proposals[0]?.status, "suggested");
		assert.equal(
			(await fixture.sourceAnalysisStore.getRecord(concept.conceptPath))?.lastCardGenerationFingerprint,
			await cardGenerationFingerprint(fixture.settings),
		);
		assert.deepEqual(fixture.progressMessages, [
			"Preparing written Concept…",
			"Waiting for AI response…",
			"Validating AI response…",
			"Saving Card proposals…",
		]);
	}

	{
		const bilingualConcept = {
			conceptId: "concept-spacing-effect",
			conceptPath: "Mneme/Concepts/间隔效应-(Spacing-Effect).md",
			conceptTitle: "间隔效应 (Spacing Effect)",
			markdown: "# 间隔效应 (Spacing Effect)\n\n## Core Meaning\n\n间隔效应把学习分散到多个时间点。",
		};
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const result = await fixture.service.generate(bilingualConcept);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "generated");
		assert.equal(proposals[0]?.cardId, "card-22222222");
	}

	{
		const conceptLearning = {
			conceptId: "concept-concept-learning",
			conceptPath: "Mneme/Concepts/Concept-Learning.md",
			conceptTitle: "Concept Learning",
			markdown: "# Concept Learning\n\n## Core Meaning\n\nConcept learning infers a general category from labeled examples.",
		};
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const result = await fixture.service.generate(conceptLearning);
		const proposals = await fixture.proposalStore.listActive();

		assert.equal(result.status, "generated");
		assert.equal(proposals[0]?.cardId, "card-22222222");
	}

	{
		const longConcept = {
			conceptId: "concept-version-space",
			conceptPath: "Mneme/Concepts/Version-Space.md",
			conceptTitle: "Version Space",
			markdown: [
				"# Version Space",
				"",
				"## Core Meaning",
				"",
				"Version space is the subset of hypotheses from hypothesis space H that remain consistent with all training examples D.",
				"",
				"## Why It Matters",
				"",
				"The general boundary G contains maximally general consistent hypotheses.",
				"",
				"The specific boundary S contains minimally general consistent hypotheses.",
				"",
				"The Candidate-Elimination algorithm updates S and G after each positive or negative training example.",
			].join("\n"),
		};
		const fixture = createFixture({ aiCaptureEnabled: true, aiMaxInputChars: 140, aiProvider: "mock" });
		fixture.provider.responseFactory = (input) => {
			const quote = firstSubstantiveLine(input.sourceContent);
			return {
				mode: "card_generation",
				proposals: [{
					confidence: 0.9,
					evidence: [{
						explanation: "Grounded in the approved Concept chunk.",
						quote,
						sourcePath: input.sourcePath,
					}],
					kind: "new_card",
					payload: {
						back: `Explain: ${quote}`,
						cardType: "definition",
						conceptId: longConcept.conceptId,
						conceptTitle: longConcept.conceptTitle,
						front: `What should you remember from chunk ${fixture.provider.callCount}?`,
						rubric: "Recalls the chunk's tested learning outcome.",
					},
					rationale: "Tests one chunk-level learning outcome.",
					title: `Version Space chunk ${fixture.provider.callCount}`,
				}],
				schemaVersion: "mneme.ai.proposals.v1",
				source: { hash: input.sourceHash, path: input.sourcePath },
				warnings: [],
			};
		};

		const result = await fixture.service.generate(longConcept);
		const proposals = await fixture.proposalStore.listProposals();

		assert.equal(result.status, "generated");
		assert.equal(fixture.provider.callCount > 1, true);
		assert.equal(result.proposalCount, fixture.provider.callCount);
		assert.equal(proposals.length, fixture.provider.callCount);
		assert.deepEqual(
			proposals.map((proposal) => proposal.cardId),
			Array.from({ length: fixture.provider.callCount }, (_, index) => createFixtureCardId(index)),
		);
		assert.equal(result.message.includes("approved Concept characters across"), true);
		assert.equal(fixture.provider.lastRequest?.sourceContent.length <= fixture.settings.aiMaxInputChars, true);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const second = await fixture.service.generate(concept);
		const active = await fixture.proposalStore.listActive();

		assert.equal(second.status, "skipped_active_proposals");
		assert.deepEqual(second.proposalIds, active.map((proposal) => proposal.id));
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const requestStarted = createDeferred();
		const releaseRequest = createDeferred();
		fixture.provider.onCall = () => requestStarted.resolve();
		fixture.provider.blocker = releaseRequest.promise;

		const firstPromise = fixture.service.generate(concept);
		await requestStarted.promise;
		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "generation_in_progress");
		assert.equal(second.proposalCount, 0);
		assert.equal(second.message.includes("already in progress for this Concept"), true);
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(fixture.generationLock.isActive("card_generation", concept.conceptPath), true);

		releaseRequest.resolve();
		const first = await firstPromise;

		assert.equal(first.status, "generated");
		assert.equal(fixture.generationLock.isActive("card_generation", concept.conceptPath), false);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.error = new Error("Temporary provider failure.");

		const failed = await fixture.service.generate(concept);
		fixture.provider.error = undefined;
		const retry = await fixture.service.generate(concept);

		assert.equal(failed.status, "failed");
		assert.equal(retry.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};

		const coveredConcept = { ...concept, existingCardTypes: ["definition" as const] };
		const first = await fixture.service.generate(coveredConcept);
		const second = await fixture.service.generate(coveredConcept);
		const record = await fixture.sourceAnalysisStore.getRecord(concept.conceptPath);

		assert.equal(first.status, "coverage_complete");
		assert.equal(first.proposalCount, 0);
		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
		assert.equal(record?.lastCardGenerationOutcome, "coverage_complete");
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const applicationOnly = createCardProposal(0);
		applicationOnly.payload.cardType = "application";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [applicationOnly],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};

		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(
			result.message,
			"Definition is enabled and this Concept has no Definition Card, but AI did not return one. No Card proposals added.",
		);
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();
		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "rejected" as const }]),
		));

		const retry = await fixture.service.generate(concept);

		assert.equal(retry.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		fixture.settings.allowedAiCardTypes = ["application"];
		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		fixture.settings.aiMaxInputChars = 120;
		const second = await fixture.service.generate(concept);

		assert.equal(second.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();

		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const updatedConcept = {
			...concept,
			markdown: `${concept.markdown}\n\n## Why It Matters\n\nUpdated Concept content.`,
		};
		const second = await fixture.service.generate(updatedConcept);

		assert.equal(second.status, "generated");
		assert.equal(fixture.provider.callCount, 2);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.loadProposals();
		await fixture.proposalStore.replaceProposals(Object.fromEntries(
			Object.entries(proposals).map(([id, proposal]) => [id, { ...proposal, status: "written" as const }]),
		));

		const metadataOnlyChange = {
			...concept,
			markdown: `---\nmneme_type: concept\ntags: [changed]\n---\n\n${concept.markdown}\n\n## Source Notes\n\n[[Notes/Changed]]`,
		};
		const second = await fixture.service.generate(metadataOnlyChange);

		assert.equal(second.status, "skipped_unchanged_concept");
		assert.equal(fixture.provider.callCount, 1);
	}

	{
		const fixture = createFixture({
			aiCaptureEnabled: true,
			aiProvider: "deepseek",
			deepseekApiKey: "",
		});
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_config");
		assert.equal(result.message.includes("DeepSeek API key is required"), true);
		assert.equal(fixture.provider.callCount, 0);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [{
				confidence: 0.9,
				evidence: [{
					explanation: "The target test still uses valid Concept grounding.",
					quote: "Encapsulation protects representation behind a stable interface.",
					sourcePath: concept.conceptPath,
				}],
				kind: "new_concept",
				payload: {},
				rationale: "Invalid in card generation.",
				title: "Invalid Concept",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: "wrong", path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "Card generation must not return new_concept proposals.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const invalidProposal = createCardProposal(0);
		invalidProposal.evidence[0]!.quote = "This quote is not in the approved Concept.";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [invalidProposal, createCardProposal(1)],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.listProposals();

		assert.equal(result.status, "generated");
		assert.equal(result.proposalCount, 1);
		assert.equal(proposals.length, 1);
		assert.equal(proposals[0]?.ai.warnings.some((warning) => warning.includes("ignored 1 ungrounded Card proposal")), true);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [{
				confidence: 0.9,
				evidence: [{
					explanation: "The target test still uses valid Concept grounding.",
					quote: "Encapsulation protects representation behind a stable interface.",
					sourcePath: concept.conceptPath,
				}],
				kind: "new_card",
				payload: {
					back: "Wrong target.",
					cardType: "definition",
					conceptId: "concept-other",
					conceptTitle: "Other",
					front: "What is this?",
					rubric: "Names the other concept.",
				},
				rationale: "Incorrect target association.",
				title: "Wrong target Card",
			}],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI Card proposals do not match the current Concept.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock", allowedAiCardTypes: ["application"] });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [createCardProposal(0)],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI returned disabled cardType 'definition'.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		fixture.provider.response = {
			mode: "card_generation",
			proposals: Array.from({ length: 6 }, (_, index) => createCardProposal(index)),
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);
		const proposals = await fixture.proposalStore.listProposals();

		assert.equal(result.status, "generated");
		assert.equal(result.proposalCount, 6);
		assert.equal(proposals.length, 6);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence[0]!.quote = "This quote is not in the approved Concept.";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI returned 1 Card proposal without verifiable approved Concept quotes. No Card proposals added.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence = [];
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "proposals.0.evidence must identify approved Concept grounding.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}

	{
		const fixture = createFixture({ aiCaptureEnabled: true, aiProvider: "mock" });
		const conceptHash = await conceptFingerprint();
		const proposal = createCardProposal(0);
		proposal.evidence[0]!.sourcePath = "Mneme/Concepts/Other/Concept.md";
		fixture.provider.response = {
			mode: "card_generation",
			proposals: [proposal],
			schemaVersion: "mneme.ai.proposals.v1",
			source: { hash: conceptHash, path: concept.conceptPath },
			warnings: [],
		};
		const result = await fixture.service.generate(concept);

		assert.equal(result.status, "invalid_response");
		assert.equal(result.message, "AI returned 1 Card proposal without verifiable approved Concept quotes. No Card proposals added.");
		assert.deepEqual(await fixture.proposalStore.listProposals(), []);
	}
}

function createCardProposal(index: number) {
	return {
		confidence: 0.9,
		evidence: [{
			explanation: "Grounded in the approved Core Meaning.",
			quote: "Encapsulation protects representation behind a stable interface.",
			sourcePath: concept.conceptPath,
		}],
		kind: "new_card" as const,
		payload: {
			back: "It protects representation behind a stable interface.",
			cardType: "definition" as const,
			conceptId: concept.conceptId,
			conceptTitle: concept.conceptTitle,
			front: `What is encapsulation? (${index + 1})`,
			rubric: "Mentions protected representation and a stable interface.",
		},
		rationale: "Tests the approved Core Meaning.",
		title: `Encapsulation Card ${index + 1}`,
	};
}

function firstSubstantiveLine(markdown: string): string {
	return markdown
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.find((line) => line.length > 20 && !line.startsWith("#"))
		?? markdown.trim();
}

async function conceptFingerprint(): Promise<string> {
	return computeContentHash(extractConceptLearningContent(concept.markdown, concept.conceptPath));
}

async function cardGenerationFingerprint(settings = DEFAULT_SETTINGS): Promise<string> {
	return createAiCardGenerationFingerprint(await conceptFingerprint(), concept.conceptPath, settings);
}

function createFixture(settingsOverrides: Partial<typeof DEFAULT_SETTINGS>) {
	const settings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
	const storage = new MemoryPluginStorage();
	const proposalStore = new KnowledgeProposalStore(storage);
	const sourceAnalysisStore = new SourceAnalysisStore(storage);
	const provider = new CountingProvider(new MockAiProvider(settings));
	const generationLock = new AiGenerationLock();
	const progressMessages: string[] = [];
	let cardIdIndex = 0;
	const service = new AiCardGenerationService({
		cardIdFactory: () => createFixtureCardId(cardIdIndex++),
		createProvider: () => provider,
		generationLock,
		onProgress: ({ message }) => progressMessages.push(message),
		proposalStore,
		settingsProvider: () => settings,
		sourceAnalysisStore,
		timestampProvider: () => "2026-01-02T12:00:00.000Z",
	});

	return {
		generationLock,
		progressMessages,
		proposalStore,
		provider,
		service,
		settings,
		sourceAnalysisStore,
	};
}

function createFixtureCardId(index: number): string {
	const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
	const suffix = alphabet[index] ?? "z";
	return `card-2222222${suffix}`;
}

class CountingProvider implements AiProvider {
	blocker?: Promise<void>;
	callCount = 0;
	error?: Error;
	lastRequest?: AiProposalRequest;
	onCall?: () => void;
	response?: unknown;
	responseFactory?: (input: AiProposalRequest) => unknown;

	constructor(private readonly delegate: AiProvider) {
	}

	async generateKnowledgeProposals(input: AiProposalRequest): Promise<AiProposalResponse> {
		this.callCount += 1;
		this.lastRequest = input;
		this.onCall?.();
		if (this.blocker) await this.blocker;
		if (this.error) throw this.error;

		const response = this.responseFactory?.(input) ?? this.response;
		if (response) {
			return {
				diagnostics: {
					inputChars: input.sourceContent.length,
					logSafeConfig: {
						allowedAiCardTypes: DEFAULT_SETTINGS.allowedAiCardTypes,
						aiCaptureEnabled: true,
						aiMaxInputChars: 20000,
						aiProvider: "mock",
						aiRequestTimeoutMs: 30000,
						deepseekApiKeyConfigured: false,
						deepseekBaseUrl: "",
						deepseekModel: "",
						openaiApiKeyConfigured: false,
						openaiBaseUrl: "",
						openaiModel: "",
						suggestEnglishAliases: false,
					},
					warnings: [],
				},
				provider: { provider: "mock", structuredOutput: "mock" },
				structuredResponse: response,
			};
		}

		return this.delegate.generateKnowledgeProposals(input);
	}
}

function createDeferred(): { promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

class MemoryPluginStorage {
	private data: MnemePluginData = {
		conceptSourceLinks: {},
		knowledgeProposals: {},
		reviewStates: {},
		schemaVersion: 1,
		settings: DEFAULT_SETTINGS,
		sourceAnalysisRecords: {},
	};

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: MnemePluginData): Promise<void> {
		this.data = data;
	}
}

void run().catch((error) => {
	console.error(error);
	process.exit(1);
});
