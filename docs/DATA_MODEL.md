# Data Model

## Principle

Markdown is the source of truth for user-facing learning content.

data.json stores state, indexes, review logs, hashes, pending suggestions, FSRS state, and caches.

Do not duplicate Concept or Card content in data.json.

Core knowledge model:

```text
Source Note <-> Concept -> Card -> FSRS
```

Markdown stores approved Concept and Card content. `data.json` stores settings, review states, later review logs, source analysis records, proposal metadata, indexes, and other plugin state.

`SourceAnalysisStore` persists `SourceAnalysisRecord` entries in plugin data. `Mneme: Analyze Current Note` always updates source path, metadata, and content hash. When AI Capture is enabled, it may also add validated Concept proposals to Inbox; it never generates Cards or writes Markdown directly.

The same record shape also tracks a written Concept's Card generation fingerprint. `lastCardGenerationFingerprint` records the assessable Concept content plus Card generation policy, chunking policy, AI chunk size, and enabled Card types used by the most recent successful generation call, including a `coverage_complete` result. A matching fingerprint blocks another generation round even after every proposal is accepted or rejected; assessable Concept content changes, enabled Card type settings, or Card-generation chunking policy can unlock a new round. Provider failures remain retryable, while changes to tags, provenance, frontmatter, or review navigation do not create a new generation round. The legacy `lastCardGenerationHash` field remains readable for data compatibility.

AI Capture settings are stored in plugin data under `settings` and configure the provider boundary:

- `aiCaptureEnabled`
- `allowedAiCardTypes`
- `aiProvider`
- `openaiApiKey`
- `openaiBaseUrl`
- `openaiModel`
- `deepseekApiKey`
- `deepseekBaseUrl`
- `deepseekModel`
- `aiRequestTimeoutMs`
- `aiMaxInputChars`

Supported provider settings include `mock`, `openai`, and `deepseek`. DeepSeek is modeled as an OpenAI-compatible provider with an editable base URL and model; the default model is `deepseek-v4-flash`, but users may change it.

These settings control AI calls from `Analyze Current Note` and `Generate Cards from Current Concept`. Concept capture uses Mneme's fixed prompt. Card generation exposes only `allowedAiCardTypes`, selected from the built-in Card type enum; free-form prompt/style customization is intentionally not persisted because it can destabilize schema validation. Provider diagnostics must use log-safe configuration summaries and must not include raw API keys.

AI raw JSON is untrusted input. The structured AI proposal contract is:

```text
AI raw JSON
-> runtime validation
-> normalization
-> KnowledgeProposal
-> Inbox review
-> Accept & Next
-> Markdown writer
```

`mneme.ai.proposals.v1` defines the concept-capture response shape. It may include machine-oriented fields such as confidence, rationale, and evidence for validation and review support, but those fields remain internal proposal metadata unless explicitly shown under Advanced / Raw JSON.

`KnowledgeProposalStore` persists Inbox proposal records in plugin data. The Inbox displays active Concept and Card proposals for review, editing, acceptance, or rejection.

Knowledge proposals may include typed payloads for proposed Concept and Card changes. These payloads are proposal state only; Markdown content is written only after explicit user acceptance.

Concept proposal content uses the same language as written Concept Markdown: `coreMeaning` and `whyItMatters`. Concept updates use `proposedCoreMeaning` and `proposedWhyItMatters`. There are no `summary` aliases in the AI schema or persisted proposal payload.

Concept-stage proposal Evidence must resolve to an exact substring of the current Source Note, and every Concept-stage proposal requires at least one verified evidence item. In chunked Source Note analysis, ungrounded Concept proposals from one chunk are discarded without aborting later chunks; if no returned Concept proposal from the whole capture can be grounded, the capture is rejected and remains retryable. Card proposal Evidence must resolve to an exact substring of the current assessable Concept content. In both stages, provider quotes that differ only by whitespace, line breaks, or Obsidian math delimiters may be reconciled to the exact stored substring; semantic paraphrases are not accepted as grounding.

User-facing Markdown must stay concise:

- `Concept.md` is a readable learning note, not a database export.
- Card Markdown is review content, not a provider trace.
- AI schema fields, provider metadata, prompt text, diagnostics, confidence scores, raw evidence arrays, source hashes, proposal ids, lifecycle metadata, and FSRS state stay in plugin data, proposal internals, diagnostics, or Advanced / Raw JSON.

Inbox acceptance is explicit. `Accept & Next` first persists the currently visible structured editor values, validates that saved proposal, writes clean editable Concept or Card Group Markdown, and marks it `written` only after a successful vault write. Rejected and written proposals are not active Inbox work.

The product-facing Inbox does not present proposal lifecycle states as primary navigation. Its main counters are To Review, Concept Proposals, Card Proposals, and Invalid items. Developer and diagnostic commands are hidden unless Developer Tools is enabled in settings.

Inbox Refresh and `Mneme: Resync Mneme Index` reconcile plugin data with the current vault. Transient stale proposals and caches may be pruned, but approved Concept-source provenance that points to a deleted Source is retained with `status: stale`. Reconciliation never deletes user Markdown or approved provenance; relinking or removing provenance requires an explicit learner action.

Guided Source Relink repairs a retained stale relationship in place at the semantic level. It preserves the relation type, evidence, and original `addedAt`; changes the Source path and content hash; refreshes `lastSeenAt`; and returns the relationship to `approved` only after the learner reviews and confirms a zero-write preview. Equivalent target links are deduplicated by Concept, Source, and relation type with evidence union. The old and new `SourceAnalysisRecord.linkedConceptIds` indexes are updated in the same transaction. A pre-existing `lastAiCaptureFingerprint` on the replacement Source remains untouched because relinking identifies provenance—it does not assert that AI has analyzed or approved the replacement content.

Reviewed Stale Provenance Removal deletes one selected stale link only after a zero-write preview and explicit confirmation. The readable Source entry and `SourceAnalysisRecord.linkedConceptIds` association are removed only when no other relationship still connects the same Concept and Source. This prevents deleting shared presentation/index state when relation types differ.

`ConceptSourceLinkStore` persists approved Source Note to Concept links in plugin data. Successful `new_concept` writes can create approved `ConceptSourceLink` records and update `SourceAnalysisRecord.linkedConceptIds`. These links are runtime index metadata, not the main Concept body.

Readable and identifiable Markdown principle:

- `Concept.md` is a human-facing learning note.
- `Concept.md` includes minimal Mneme frontmatter for stable identification.
- One Card Group Markdown file contains the Concept's review Cards as independently identified blocks.
- The Card Group includes minimal Mneme frontmatter for Concept association.
- `Concept.md` links to the Concept's Card Group file.
- Card Markdown links back to `Concept.md`.
- Machine metadata remains in plugin data.
- Source evidence is optional and should use progressive disclosure.
- Cards should not be dumped into `Concept.md` by default.

Stable identity principle:

- `mneme_id` is the immutable Concept identity.
- `mneme_title` is the editable primary-language Concept Title. `mneme_english_name` is an optional legacy-keyed English Alias used only for display/search when the feature is enabled or an existing note already stores one. The H1 may compose `Concept Title (English Alias)` and is not identity.
- New Concept IDs are immutable opaque identities allocated independently as `concept-<8 random characters>`, for example `concept-k7m3p9qx`. A path collision adds `-2`, `-3`, and so on only to the file path and Card Group locator; it does not rewrite `mneme_title`, the alias, or the ID. An ID collision causes regeneration.
- Explicit `MNEME:CARD` ids are immutable Card identities. New Cards use independently allocated `card-<8 random characters>` IDs, for example `card-gjsl5r2n`. Concept ID, Card Type, Front, paths, and AI output do not participate in allocation; collisions cause regeneration.
- Manually authored Cards use the same marker renderer and ID allocator as accepted AI proposals. Their drafts are optional plugin data only; successful creation writes directly to the declared Card Group and clears the content draft without creating a `KnowledgeProposal`.
- AI proposal `cardType` is immutable within Proposal Review. Editable proposal content is limited to Front, Back, and Rubric; manual Card creation is the surface where a learner deliberately chooses Card Type before authoring.
- Titles, paths, folders, and Card indexes are mutable locators or presentation details.
- Durable plugin state must never use a path fallback as its long-term key.
- Legacy Markdown with missing or duplicate IDs remains readable but enters a Repair Flow before new durable state is created.
- Cards without explicit stable IDs may be opened for repair, but they are excluded from Today’s Focus and FSRS review until repaired.

Card ID repair re-reads the latest Markdown and verifies the expected block content and current ID before writing. Assigning an ID to a legacy fallback Card migrates that unambiguous Card's FSRS state, Review Tomorrow deferral, and suspension atomically. Replacing one duplicate ID does not migrate the shared old-ID state because Mneme cannot prove which duplicate owned it; the unchanged duplicate retains that state and the repaired Card starts fresh.

Card content editing follows the same targeted-write rule. The editor captures the selected Card's Front, Back, and Rubric as its baseline, re-reads the Card Group at Save, locates a locally unique stable ID when available, and aborts if that target changed. Concurrent changes to other Card blocks remain intact. Known vault-wide duplicate IDs and duplicate occurrences inside the latest Card Group are identity conflicts and cannot be used to select content for editing.

Concept ID repair follows the same ownership boundary. The Concept scanner excludes missing and duplicate IDs from normal Concept results and reports them as repair diagnostics. A guided repair updates Concept.md together with its explicitly linked Card Group. Legacy Concept pause records may still be re-keyed by repair code for data compatibility, but they are ignored and cleared by the current Review UI.

## File Layout

Recommended vault layout:

Mneme/
  Concepts/
    Information-Gain.md
    Equivalence-Partitioning.md

  Cards/
    Information-Gain/
      Cards.md

Plugin internal data:

.obsidian/plugins/mneme/
  data.json

## Concept files

A Concept Markdown file is the source of truth for Concept content. New Concepts are written directly under the configured Concepts folder, for example `Mneme/Concepts/Information-Gain.md`.

Minimal generated frontmatter fields:

- mneme_type: concept
- mneme_id: string
- mneme_title: string
- mneme_english_name: string
- mneme_version: 1
- cards: Obsidian link to the Concept's Card Group file
- learning_mode: optional reviewable | exploratory
- importance: optional low | normal | high | critical
- retention_target: optional explicit Concept-level FSRS request retention from 0.70 to 0.98
- tags: optional user-approved organization tags for Concept Library filtering

Generated Concepts include only sections with useful content, except the always-present Review Cards link. Recommended sections are:

- Core Meaning
- Why It Matters
- Views
- Common Traps
- Review Cards
- Source Notes
- Related Concepts, when links exist

`Source Notes` is an optional canonical section, not a separate manual format. AI-accepted and manually authored Concepts use the same renderer. A Concept with approved provenance includes the section; a genuinely source-free manual Concept omits it. Adding provenance later inserts the same standard section and index records.

Plugin data may contain one `manualConceptDraft` for the dockable Concept Composer. It stores editable learning fields, optional Source Note path, organization fields, and an update timestamp. It is draft UI state only: it is not an approved Concept, KnowledgeProposal, or Source evidence record.

Plugin data may also contain `conceptConflictMergeDrafts`, keyed by the originating Inbox Proposal (`inbox:<proposalId>`) or the Manual Composer (`manual`). Each record stores only the editable merged learning-content draft, the existing Concept ID, an incoming-content fingerprint, and an update timestamp. It is recoverable UI state, not approved Concept content. Prepared before/after Markdown and transactional write plans are never persisted.

Example structure:

---
mneme_type: concept
mneme_id: concept-information-gain
mneme_title: Information Gain
mneme_english_name: Information Gain
mneme_version: 1
cards: "[[Mneme/Cards/Information-Gain/Cards|Information Gain Cards]]"
importance: normal
learning_mode: reviewable
tags: [machine-learning, decision-trees]
---

# Information Gain

## Core Meaning

Information gain measures the reduction of uncertainty after splitting a dataset by an attribute.

## Why It Matters

Splitting criteria depend on it when choosing useful decision-tree attributes.

## Review Cards

Cards: [[Mneme/Cards/Information-Gain/Cards|Information Gain Cards]]

## Source Notes

> [!info]- Source Notes
> - [[Decision Tree Notes]]
>   - relation: origin
>   - evidence: introduces the basic definition.

## Concept Fields

### importance

Controls long-term review priority among already eligible Concepts. It does not change desired retention, Card eligibility, or FSRS parameters.

Recommended mapping:

- low: background knowledge
- normal: ordinary long-term value
- high: important long-term knowledge
- critical: must-master concept

### learning_mode

Controls how the concept is learned.

- exploratory: only for low-stakes exploration
- reviewable: concept can have Cards reviewed through FSRS

### retention_target

An optional learner-authored override for the global FSRS Request Retention setting. It applies to future rated reviews of Cards belonging to this Concept. It does not reschedule existing Cards when edited, and Importance never supplies or changes it. If omitted, Review uses the current global setting.

### tags

Tags are user-approved organization labels for browsing and filtering Concepts. Tags are not Concept relationships and do not imply prerequisites, applications, or similarity. Concept relationships belong in `Related Concepts` as links to existing approved Concepts.

AI-generated tags are constrained at proposal time: they must be English lowercase slugs, at most three per Concept, broad enough for filtering, and chosen without existing-tag context during AI Capture. Mneme filters obvious AI tag drift such as non-English generated tags, Concept-title tags, isolated adjectives, and generic tags like `learning`, `theory`, `model`, `method`, `concept`, or `optimal`.

The Tag Catalog is a transient index rebuilt from approved Concept Markdown. It contains normalized tag names and usage counts, is not a second source of truth, and is not sent to the AI provider. Mneme uses it locally after AI generation to reuse normalized exact matches and in manual/approval UI to rank existing suggestions. Similarity produces a review suggestion only; it never establishes an automatic rename or merge.

New tags created through Mneme's picker must be English lowercase slugs. Historical or externally authored tags in other scripts remain readable and are preserved when already selected; Mneme does not silently rewrite existing Concept Markdown. Future Tag Manager work may offer reviewed merges such as `learning` -> `machine-learning`.

### Related Concepts

The MVP supports one symmetric Concept relationship named `Related`. Markdown is the source of truth and stores only readable Obsidian links:

```markdown
## Related Concepts

- [[Mneme/Concepts/Bayes-Theorem|Bayes Theorem]]
```

The section label already supplies the relation meaning, so individual lines do not repeat `Related`. Adding or removing a relationship updates both Concept files. Internally the unordered pair of stable Concept IDs identifies the relationship; filenames and display titles may change without changing its meaning. Empty sections are omitted.

Concept capture remains context-free and does not create Related links. Tags, shared Sources, and text similarity may later help an explicit discovery workflow shortlist candidates, but none of them independently establishes a relationship.

Guided Merge treats Related links as graph edges: the survivor receives the union of both neighbor sets, links between the two merged Concepts disappear as self-links, duplicate neighbors collapse by Concept ID, and affected neighbor Concept files are rewired to the survivor in the same reviewed transaction.

## Card Group files

Each Concept has one Card Group Markdown file, for example `Mneme/Cards/Information-Gain/Cards.md`. The file is the content source of truth for all of that Concept's Cards; every Card block retains an independent stable ID and Card Memory State.

When two new Concepts have the same title, Mneme first assigns a unique Concept filename and uses that unique stem for the initial Card Group folder. Once written, the Concept's `cards` link is the location authority, so later title edits do not fork the Card Group.

Minimal generated frontmatter fields:

- mneme_type: card_group
- mneme_concept_id: string
- mneme_version: 1
- concept: Obsidian link to the Concept file

Required marker sections:

- MNEME:FRONT
- MNEME:BACK

Recommended marker sections:

- MNEME:RUBRIC

Required wrapper markers for newly generated Cards:

- MNEME:CARD

Legacy one-Card files remain readable. Mneme does not silently delete or consolidate them; new accepted Card proposals use the canonical Card Group format.

Example structure:

---
mneme_type: card_group
mneme_concept_id: concept-information-gain
mneme_version: 1
concept: "[[Mneme/Concepts/Information-Gain|Information Gain]]"
---

# Information Gain Cards

<!-- Mneme cards below -->

<!-- MNEME:CARD:start id="information-gain-definition" type="definition" -->
<!-- MNEME:FRONT:start -->
Why does information gain tend to favor attributes with many values?
<!-- MNEME:FRONT:end -->

<!-- MNEME:BACK:start -->
Because attributes with many values can split samples into smaller and purer subsets, causing larger entropy reduction.
<!-- MNEME:BACK:end -->

<!-- MNEME:RUBRIC:start -->
- Mentions many-valued attributes
- Mentions smaller or purer subsets
- Mentions entropy reduction
<!-- MNEME:RUBRIC:end -->
<!-- MNEME:CARD:end -->

Additional Cards append another identified block in the same file:

<!-- MNEME:CARD:start id="card_information_gain_definition" -->
<!-- MNEME:FRONT:start -->
Question 1
<!-- MNEME:FRONT:end -->

<!-- MNEME:BACK:start -->
Answer 1
<!-- MNEME:BACK:end -->
<!-- MNEME:CARD:end -->

<!-- MNEME:CARD:start id="card_information_gain_bias" -->
<!-- MNEME:FRONT:start -->
Question 2
<!-- MNEME:FRONT:end -->

<!-- MNEME:BACK:start -->
Answer 2
<!-- MNEME:BACK:end -->
<!-- MNEME:CARD:end -->

## Card Parsing Rules

- FRONT and BACK are required.
- RUBRIC is recommended and missing RUBRIC should produce a warning, not a fatal error.
- Existing single-card files without CARD wrappers remain valid.
- If CARD wrappers are present, each complete CARD block is parsed as one card.
- CARD wrappers should include a stable id, for example `<!-- MNEME:CARD:start id="card_id" -->`.
- CARD wrappers may include a `type` attribute for assessment coverage, for example `type="application"`.
- Missing CARD ids use fallback identity and should produce a warning.
- Duplicate CARD ids make affected cards invalid.
- Extra Markdown outside markers is allowed.
- Missing FRONT or BACK makes the card invalid.
- Invalid cards must not crash Review View.
- Invalid cards should be shown with a repair option.
- A `card_group` file with no CARD or section markers is a valid empty Card Group, not a malformed legacy Card.

The safe automatic repair path is intentionally narrow. If a FRONT or BACK section is entirely absent, Mneme may add the missing canonical section after the learner supplies its content, while preserving all surrounding Markdown and leaving FSRS state unchanged. Duplicate markers, unclosed markers, malformed CARD wrappers, and duplicate IDs require manual or future guided repair rather than destructive canonicalization.

## data.json

data.json may store:

- plugin settings
- AI provider settings
- source note hashes
- concept-source links
- pending suggestions
- FSRS card state
- temporary review deferrals (`reviewDeferrals`), stored separately from FSRS state
- legacy paused Concept controls (`pausedConcepts`), retained only for data compatibility and cleared by current Review UI
- suspended Card controls (`suspendedCards`), keyed by stable Card id
- retired Card controls (`retiredCards`), keyed by stable Card id
- content-free review events (`reviewEvents`), keyed by event id
- Concept Learning State cache
- deleted Card tombstones
- dismissed Possible Duplicate pairs (`conceptDuplicateDismissals`), keyed by an ordered stable-ID pair
- recoverable exact-name conflict Merge drafts (`conceptConflictMergeDrafts`)
- Concept Merge Records (`conceptMergeRecords`), keyed by the permanently retired Concept ID
- card validity cache

data.json must not store:

- Concept Core Understanding as source of truth
- Card Front as source of truth
- Card Back as source of truth
- Card Rubric as source of truth

`reviewDeferrals` maps a Card id to `deferredAt` and `resumeAt`. The Review Tomorrow action uses this state to hide a Card from Today’s Focus until the next local day. Creating a deferral does not modify the Card's FSRS due date, stability, difficulty, review count, or lapse count.

`pausedConcepts` is a legacy compatibility map. Current Mneme Review does not offer Concept pause/resume, does not use this map for eligibility, and clears old entries without changing Card Markdown, FSRS state, or review history.

`suspendedCards` maps a Card id to `suspendedAt`. Suspension removes only that Card from Today’s Focus until explicit resume and clears any temporary Review Tomorrow deferral; Card Markdown and FSRS state remain unchanged.

`retiredCards` maps a stable Card id to `retiredAt`. The user-facing Archive Card action clears temporary deferral and suspension controls, preserves Markdown and FSRS state, and removes the Card from Today’s Focus and Concept Learning State aggregation until explicit restore. The persisted name remains unchanged for compatibility.

Retired Cards preserve Markdown and history but are excluded from active review. Deleting a Card removes its exact Markdown block and active FSRS/control state after confirmation, then records a content-free tombstone so the Card ID cannot be reused and anonymous review history remains statistically valid. `Delete History Too` is a separately confirmed complete-erasure action for a deleted Card's tombstone and review events; it is not the normal deletion path and should not be presented as a routine way to make IDs reusable.

Each `reviewEvents` record contains only `eventId`, stable `cardId`, `rating`, and `reviewedAt`; it stores no Card content. A `cardTombstones` record contains only `cardId`, `deletedAt`, `reviewCount`, and `lapseCount`. Existing Cards created before event logging may have aggregate counts without reconstructable per-review events. Global Clear Review History removes events and zeros tombstone counts while retaining tombstones for identity safety.

Possible Duplicate candidates are derived from current Concept titles and Core Meaning text and are not persisted as knowledge. Only a learner's `Not a duplicate` decision is stored, as `pairKey`, two stable Concept IDs, and `dismissedAt`. Dismissal does not create a relationship between the Concepts and may be reconsidered.

A `conceptMergeRecords` entry stores `mergedConceptId`, `survivorConceptId`, `mergedPath`, `survivorPath`, and `mergedAt`. It contains no learning content. The merged ID remains reserved after the old Concept becomes a `concept_redirect`, preventing a later generated Concept from reusing that identity. The redirect retains the original Markdown body and custom frontmatter at the original path as historical content. Its active `mneme_id` becomes `former_mneme_id`, its type excludes it from Concept scanning, and a leading notice links to the survivor. Historical Card links and learning properties on the redirect are not active Concept associations.

Guided Merge moves complete stable-ID Card blocks into the surviving Card Group without rewriting their IDs or Card-keyed FSRS state. If the survivor has no Card Group, it adopts the merged Concept's group and updates that group's association. A vacated Card Group remains as an empty `card_group` redirect so old vault links resolve without creating a phantom Card. Legacy per-Card folders must be explicitly consolidated before Guided Merge; Mneme does not guess a destructive migration.

An ordinary two-written-Concept Merge draft is transient UI state. An exact-name conflict Merge may persist its editable draft in `conceptConflictMergeDrafts` so closing the workspace does not lose work; the Inbox Proposal or `manualConceptDraft` remains the authoritative incoming source until confirmation. Manual Draft deterministically unions tags, selects the stronger importance, and uses `reviewable` when either side is reviewable. Optional AI draft output is limited to Title, Core Meaning, Why It Matters, and English Alias only when that setting is enabled. A prepared Merge plan is always a non-persisted zero-write snapshot containing affected Markdown before/after content and the complete next plugin-data value. Execute succeeds only while every before-snapshot and plugin-data snapshot still matches; otherwise it reports a conflict. Rollback restores already-written Markdown and the original plugin data.

## Product Boundary

Concepts are vault-global and are not owned by folders, tags, Source Notes, or temporary learning contexts. Course Context, Exam Mode, Exam Attempts, Use Mode, and AI answer grading are not part of the product data model.

Normal review is local and deterministic. Only a learner-confirmed Again, Hard, Good, or Easy rating from normal Card review writes FSRS state or review history; AI is not called in that loop.

## External Exports

Anki export is a one-way UTF-8 TSV snapshot of active valid approved Cards. The exported copies have independent content and scheduling state; Mneme performs no Anki synchronization. Invalid Cards, Cards without explicit stable IDs, and Retired Cards are excluded from the default export.

A Knowledge Context Pack exports a neutral index plus selected clean Concept Markdown. It includes all approved Concepts by default, may later support explicit manual Concept selection, and excludes Source Notes, Cards, credentials, scheduler state, and diagnostics. Its README states that approved knowledge is not a mastery claim. It is an export utility, not a Use Mode or project request.

## Markdown Writing Settings

Mneme stores writer folder settings in plugin data:

- `conceptsFolder`: default `Mneme/Concepts`
- `cardsFolder`: default `Mneme/Cards`

These settings affect future explicit Markdown writes only. They do not move existing files and do not change review state.

## Source Note Hash

For each analyzed Source Note, store:

- sourcePath
- contentHash
- lastAiCaptureFingerprint (optional; identifies the Source, provider/model, chunk size, chunking version, and prompt policy that completed proposal capture)
- lastAiCaptureAnalyzedChars (optional)
- lastAiCaptureTotalChars (optional)
- lastAiCaptureChunkCount (optional)
- lastCardGenerationFingerprint (optional; records assessable Concept content plus Card generation policy and enabled Card types that completed Card proposal generation)
- lastCardGenerationOutcome (optional diagnostic result: `proposed` or `coverage_complete`; both close the recorded fingerprint until assessable Concept content or enabled Card type settings change)
- lastCardGenerationHash (deprecated compatibility alias)
- mtime
- size
- lastAnalyzedAt

Skip Concept capture only when the newly computed capture fingerprint matches `lastAiCaptureFingerprint`. The complete Source Note is split into contiguous Markdown-aware Concept extraction requests of at most the smaller of `aiMaxInputChars` and Mneme's internal Concept extraction target, currently 6,000 characters; a successful capture records complete character coverage and chunk count. Provider/model changes, configured chunk-size changes, effective extraction chunk-size changes, and capture-policy changes intentionally produce a new fingerprint even when Source Markdown is unchanged.

For written Concepts, compare the Card generation fingerprint rather than the whole file. Active proposals block duplicate Inbox rounds for the same learning content; any successful generation call records a fingerprint that remains closed after proposals are accepted or rejected. Existing Card fronts are supplied as a Coverage Map so providers can avoid proposing the same outcome again. Long approved Concepts are split into Markdown-aware Card-generation chunks and aggregated across the complete assessable Concept content rather than truncated to one provider request. Assessable Concept content changes or enabled Card type settings can unlock a new attempt; metadata-only edits cannot.

## FSRS State

FSRS state belongs to Cards, not Concepts.

Concept Learning State is a reasoned aggregate of Card Memory States and assessment coverage. It is diagnostic and must not be presented as a mastery percentage or used as a Concept scheduler.

## Concept-first Extraction

v0.1 uses ConceptSuggestion[] as the AI output object.

Mneme does not use an explicit KnowledgeUnit layer in v0.1.

Duplicate or overlapping concepts are allowed at capture time and handled later through possible match, merge, or update flows. Generation does not receive the existing vault or Inbox as duplicate-avoidance context.

## Scheduling Principle

Mneme uses card-level memory states for scheduling accuracy.

FSRS, or any scheduler, operates on individual Cards. Concepts are user-facing review units. Concept priority is computed by aggregating card-level memory states.

Task 012 introduced a scheduler abstraction. Task 015 adds an FSRS scheduler adapter behind that abstraction.

## FSRS Scheduler Adapter

`FsrsReviewScheduler` implements `ReviewScheduler` using `ts-fsrs`. `ReviewStateStore` remains scheduler-agnostic and persists the returned card-level memory state by stable `cardId`.

The concept queue remains concept-level. FSRS does not schedule Concepts directly.

Existing placeholder review states are treated conservatively: they are not converted into FSRS memory states. Users can run `Mneme: Clear Review History` before FSRS testing if they want a clean reset.

When `fsrsEnabled` is true, FSRS `dueAt` is the authority for review eligibility. New Cards enter review. Reviewed Cards enter review only when `dueAt <= now`. Mneme does not apply daily Concept, daily Card, or per-Concept Card caps after this eligibility decision.

Retrievability remains diagnostic for reviewed FSRS Cards. It may be useful as a secondary signal among already-due Cards, but it must not promote non-due Cards into Daily Review.

## FSRS Settings

Mneme stores minimal FSRS scheduler settings in plugin data alongside review state:

- `fsrsEnabled` controls whether Today’s Focus scheduled review is shown. It defaults to `true`. Manual Concept Review still records FSRS ratings when this is false.
- `fsrsRequestRetention` controls the target recall probability. Higher retention usually means shorter intervals and more reviews.
- `fsrsEnableFuzz` spreads longer-interval reviews with small randomness to reduce review clustering.
- `fsrsMaximumInterval` caps how far into the future a Card can be scheduled.
- `showAdvancedDiagnostics` is a review-UI visibility preference that defaults to `false`. It exposes maintenance diagnostics only and has no effect on eligibility, FSRS state, Markdown, or review history.

Scheduler parameters affect future reviews only; they do not rewrite existing Card review states. Hiding Today’s Focus also leaves states, due dates, and event history untouched. Re-enabling Today’s Focus does not shift stored dates or freeze the clock: overdue Cards are immediately eligible, and the next rating uses the real time since `lastReviewedAt`. Cards created while Today’s Focus is hidden remain new until first rated from manual Concept Review or scheduled review. `Mneme: Clear Review History` is the only explicit reset command.

## Concept Memory Aggregation

Card-level memory state remains the source of scheduling truth.

Concept memory is an aggregation over a Concept's Cards. It distinguishes all-card diagnostics from the Daily Review subset:

- Daily Review Cards are new Cards and reviewed Cards whose `dueAt` is due.
- Non-due Cards remain visible in diagnostics.
- FSRS retrievability can be shown as diagnostic risk: `risk = 1 - retrievability`.
- Placeholder risk remains available for new, malformed, or non-FSRS diagnostic states.

## Concept Queue Ranking

The main review queue is concept-centered.

When FSRS is enabled, Concepts are ranked as groups of review-eligible Cards. The main queue shows every Concept that contains at least one due or new Card after explicit exclusions; ranking never truncates the queue.

Not-due-only Concepts are hidden from the main queue but visible in diagnostics. FSRS remains card-level; concept ranking never overrides FSRS scheduling.

No planned mode may bypass `dueAt` while recording an FSRS review. A future stateless `Rediscover a Concept` entry point may open a Concept or enter its existing normal Card review, but it cannot create a parallel learning state, submit a rating outside the normal review flow, or call AI.

## Concept Library

The Concept Library scans readable, identifiable `Concept.md` files and builds lightweight `ConceptSummary` records at runtime.

Concept recognition uses minimal frontmatter:

- `mneme_type: concept`
- `mneme_id`

The library displays clean learning information from Markdown sections such as Core Meaning and Why It Matters. It can open the Concept file and linked Card Group, but it does not replace Markdown editing or store Concept content in `data.json`.

This scanner supports Concept Library, review, repair, and explicit Merge workflows. It is not supplied to `Analyze Current Note`; AI Capture remains context-free and proposes only new Concepts from the current Source Note.

## Concept-First Capture

Source Note analysis and future vault scanning are Concept-first. They may create Concept-stage proposals, but they must not create Card proposals during the initial source-analysis step.

Card proposals are created later from written Concepts. They remain Inbox proposals until reviewed, approved, and explicitly written to Card Markdown.

Each generation run returns non-duplicative Card proposals guided by a Coverage Map, with no fixed proposal-count cap. Every proposed Card identifies one independently testable Card Grounding in approved Concept content. Mneme should generate enough Cards to cover distinct high-value learning outcomes without collapsing a multi-part Concept into one omnibus Card or forcing unsuitable Card types. Missing knowledge must become a reviewed Concept proposal before a dependent Card can be written.

This preserves the product model:

```text
Source Note -> Concept proposal -> Concept.md -> Card proposal -> Card Markdown -> FSRS
```

See also: [Pre-FSRS Architecture Checkpoint](PRE_FSRS_CHECKPOINT.md).

See also: [Post-FSRS Integration Checkpoint](POST_FSRS_CHECKPOINT.md).

See also: [FSRS Integration Contract](FSRS_INTEGRATION_CONTRACT.md).

See also: [Concept-Source Model](CONCEPT_SOURCE_MODEL.md).

See also: [AI Capture Approval Flow](AI_CAPTURE_APPROVAL_FLOW.md).
