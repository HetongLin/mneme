# Data Model

## Principle

Markdown is the source of truth for user-facing learning content.

data.json stores state, indexes, review logs, hashes, pending suggestions, FSRS state, and caches.

Do not duplicate Concept or Card content in data.json.

Core knowledge model:

```text
Source Note <-> Concept -> Card -> FSRS
```

Markdown stores approved `Concept.md` and `Card.md` content. `data.json` stores settings, review states, later review logs, source analysis records, proposal metadata, indexes, and other plugin state.

`SourceAnalysisStore` persists `SourceAnalysisRecord` entries in plugin data. `Mneme: Analyze Current Note` always updates source path, metadata, and content hash. When AI Capture is enabled, it may also add validated Concept proposals to Inbox; it never generates Cards or writes Markdown directly.

AI Capture settings are stored in plugin data under `settings` and configure the provider boundary:

- `aiCaptureEnabled`
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

These settings control AI calls from `Analyze Current Note`. Provider diagnostics must use log-safe configuration summaries and must not include raw API keys.

AI raw JSON is untrusted input. The structured AI proposal contract is:

```text
AI raw JSON
-> runtime validation
-> normalization
-> KnowledgeProposal
-> Inbox review
-> Accept
-> Markdown writer
```

`mneme.ai.proposals.v1` defines the concept-capture response shape. It may include machine-oriented fields such as confidence, rationale, and evidence for validation and review support, but those fields remain internal proposal metadata unless explicitly shown under Advanced / Raw JSON.

`KnowledgeProposalStore` persists Inbox proposal records in plugin data. The Inbox displays active Concept and Card proposals for review, editing, acceptance, or rejection.

Knowledge proposals may include typed payloads for proposed Concept and Card changes. These payloads are proposal state only; Markdown content is written only after explicit user acceptance.

User-facing Markdown must stay concise:

- `Concept.md` is a readable learning note, not a database export.
- `Card.md` is review content, not a provider trace.
- AI schema fields, provider metadata, prompt text, diagnostics, confidence scores, raw evidence arrays, source hashes, proposal ids, lifecycle metadata, and FSRS state stay in plugin data, proposal internals, diagnostics, or Advanced / Raw JSON.

Inbox acceptance is explicit. `Accept Concept` and `Accept Card` validate supported proposal payloads, write clean editable `Concept.md` / `Card.md`, and mark proposals `written` only after a successful vault write. Rejected and written proposals are not active Inbox work.

The product-facing Inbox does not present proposal lifecycle states as primary navigation. Its main counters are To Review, Concept Proposals, Card Proposals, and Invalid items. Developer and diagnostic commands are hidden unless Developer Tools is enabled in settings.

Inbox Refresh and `Mneme: Resync Mneme Index` reconcile plugin data with the current vault. Transient stale proposals and caches may be pruned, but approved Concept-source provenance that points to a deleted Source is retained with `status: stale`. Reconciliation never deletes user Markdown or approved provenance; relinking or removing provenance requires an explicit student action.

`ConceptSourceLinkStore` persists approved Source Note to Concept links in plugin data. Successful `new_concept` writes can create approved `ConceptSourceLink` records and update `SourceAnalysisRecord.linkedConceptIds`. These links are runtime index metadata, not the main Concept body.

Readable and identifiable Markdown principle:

- `Concept.md` is a human-facing learning note.
- `Concept.md` includes minimal Mneme frontmatter for stable identification.
- `Card.md` is the Concept's review-card file.
- `Card.md` includes minimal Mneme frontmatter for Concept association.
- `Concept.md` links to `Card.md`.
- `Card.md` links back to `Concept.md`.
- Machine metadata remains in plugin data.
- Source evidence is optional and should use progressive disclosure.
- Cards should not be dumped into `Concept.md` by default.

Stable identity principle:

- `mneme_id` is the immutable Concept identity.
- Explicit `MNEME:CARD` ids are immutable Card identities.
- Titles, paths, folders, and Card indexes are mutable locators or presentation details.
- Durable plugin state must never use a path fallback as its long-term key.
- Legacy Markdown with missing or duplicate IDs remains readable but enters a Repair Flow before new durable state is created.

Card ID repair re-reads the latest Markdown and verifies the expected block content and current ID before writing. Assigning an ID to a legacy fallback Card migrates that unambiguous Card's FSRS state, Review Later deferral, and suspension atomically. Replacing one duplicate ID does not migrate the shared old-ID state because Mneme cannot prove which duplicate owned it; the unchanged duplicate retains that state and the repaired Card starts fresh.

Concept ID repair follows the same ownership boundary. The Concept scanner excludes missing and duplicate IDs from normal Concept results and reports them as repair diagnostics. A guided repair updates Concept.md together with its explicitly linked Card Group. A missing-ID repair may re-key a uniquely attributable Concept pause; duplicate-ID repair leaves shared aggregate state on the unchanged original identity.

## File Layout

Recommended vault layout:

Mneme/
  Concepts/
    Information Gain.md
    Equivalence Partitioning.md

  Cards/
    Information Gain/
      Card.md

Plugin internal data:

.obsidian/plugins/mneme/
  data.json

## Concept.md

Concept.md is the source of truth for Concept content.

Minimal generated frontmatter fields:

- mneme_type: concept
- mneme_id: string
- mneme_version: 1
- cards: optional Obsidian link to Card.md
- learning_mode: optional reviewable | exploratory
- importance: optional low | normal | high | critical

Recommended sections:

- Core Meaning
- Why It Matters
- Views
- Common Traps
- Review
- Source Notes
- Related Concepts

Example structure:

---
mneme_type: concept
mneme_id: concept-information-gain
mneme_version: 1
cards: "[[Mneme/Cards/Information Gain/Card|Information Gain Cards]]"
importance: normal
learning_mode: reviewable
---

# Information Gain

## Core Meaning

Information gain measures the reduction of uncertainty after splitting a dataset by an attribute.

## Why It Matters

Add why this concept matters here.

## Views

Add views here.

## Common Traps

Add common traps here.

## Review

> [!note]- Review Cards
> [[Mneme/Cards/Information Gain/Card|Information Gain Cards]]

## Source Notes

> [!info]- Source Notes
> - [[Decision Tree Notes]]
>   - relation: origin
>   - evidence: introduces the basic definition.

## Related Concepts

<!-- Add related concepts here. -->

## Concept Fields

### importance

Controls long-term review priority among already eligible Concepts. It does not change desired retention, Card eligibility, or FSRS parameters.

Recommended mapping:

- low: background knowledge
- normal: ordinary course concept
- high: important course concept
- critical: must-master concept

### learning_mode

Controls how the concept is learned.

- exploratory: only for low-stakes exploration
- reviewable: concept can have Cards reviewed through FSRS

## Card.md

Card.md is the source of truth for review UI content.

Minimal generated frontmatter fields:

- mneme_type: card_group
- mneme_concept_id: string
- mneme_version: 1
- concept: Obsidian link to Concept.md

Required marker sections:

- MNEME:FRONT
- MNEME:BACK

Recommended marker sections:

- MNEME:RUBRIC

Required wrapper markers for newly generated Cards:

- MNEME:CARD

Legacy single-card files without a CARD wrapper remain readable but should be offered stable-ID repair.

Example structure:

---
mneme_type: card_group
mneme_concept_id: concept-information-gain
mneme_version: 1
concept: "[[Mneme/Concepts/Information Gain/Concept|Information Gain]]"
---

# Information Gain Cards

Related Concept: [[Mneme/Concepts/Information Gain/Concept|Information Gain]]

<!-- Mneme cards below -->

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

Multi-card Card.md files may wrap repeated card sections. Explicit CARD ids are preferred because future review state needs stable card identity:

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
- Missing CARD ids use fallback identity and should produce a warning.
- Duplicate CARD ids make affected cards invalid.
- Extra Markdown outside markers is allowed.
- Missing FRONT or BACK makes the card invalid.
- Invalid cards must not crash Review View.
- Invalid cards should be shown with a repair option.
- A `card_group` file with no CARD or section markers is a valid empty Card Group, not a malformed legacy Card.

The safe automatic repair path is intentionally narrow. If a FRONT or BACK section is entirely absent, Mneme may add the missing canonical section after the student supplies its content, while preserving all surrounding Markdown and leaving FSRS state unchanged. Duplicate markers, unclosed markers, malformed CARD wrappers, and duplicate IDs require manual or future guided repair rather than destructive canonicalization.

## data.json

data.json may store:

- plugin settings
- AI provider settings
- source note hashes
- concept-source links
- pending suggestions
- FSRS card state
- temporary review deferrals (`reviewDeferrals`), stored separately from FSRS state
- paused Concept controls (`pausedConcepts`), keyed by stable Concept id
- suspended Card controls (`suspendedCards`), keyed by stable Card id
- retired Card controls (`retiredCards`), keyed by stable Card id
- content-free review events (`reviewEvents`), keyed by event id
- Needs Work Signals
- Concept Learning State cache
- Exam Attempts
- deleted Card tombstones
- dismissed Possible Duplicate pairs (`conceptDuplicateDismissals`), keyed by an ordered stable-ID pair
- card validity cache

data.json must not store:

- Concept Core Understanding as source of truth
- Card Front as source of truth
- Card Back as source of truth
- Card Rubric as source of truth

`reviewDeferrals` maps a Card id to `deferredAt` and `resumeAt`. Review Later uses this state to hide a Card from Today’s Focus until the next local day. Creating a deferral does not modify the Card's FSRS due date, stability, difficulty, review count, or lapse count.

`pausedConcepts` maps a Concept id to `pausedAt`. Pausing excludes that Concept from Today’s Focus until the user resumes it; its Markdown, Cards, and FSRS states are untouched.

`suspendedCards` maps a Card id to `suspendedAt`. Suspension removes only that Card from Today’s Focus until explicit resume and clears any temporary Review Later deferral; Card Markdown and FSRS state remain unchanged.

`retiredCards` maps a stable Card id to `retiredAt`. Retirement clears temporary deferral and suspension controls, preserves Markdown and FSRS state, and removes the Card from Today’s Focus and Concept Learning State aggregation until explicit restore.

Retired Cards preserve Markdown and history but are excluded from active review. Deleting a Card removes its exact Markdown block and active FSRS/control state after confirmation, then records a content-free tombstone so the Card ID cannot be reused and anonymous review history remains statistically valid. `Delete History Too` explicitly removes the tombstone and review events.

Each `reviewEvents` record contains only `eventId`, stable `cardId`, `rating`, and `reviewedAt`; it stores no Card content. A `cardTombstones` record contains only `cardId`, `deletedAt`, `reviewCount`, and `lapseCount`. Existing Cards created before event logging may have aggregate counts without reconstructable per-review events. Global Clear Review History removes events and zeros tombstone counts while retaining tombstones for identity safety.

Possible Duplicate candidates are derived from current Concept titles and Core Meaning text and are not persisted as knowledge. Only a student's `Not a duplicate` decision is stored, as `pairKey`, two stable Concept IDs, and `dismissedAt`. Dismissal does not create a relationship between the Concepts and may be reconsidered.

## Courses And Exam Contexts

Concepts are vault-global. A Course relates to Concepts many-to-many and may contribute Sources, Views, and a Course Priority without owning a duplicate Concept. Exam Focus is temporary to a specific exam and does not mutate global Concept importance.

Exam Attempts are stored separately from review logs. They may produce Needs Work Signals, but they do not update Card Memory State or FSRS history.

## External Exports

Anki export is a one-way UTF-8 TSV snapshot of approved Cards. The exported copies have independent content and scheduling state; Mneme performs no Anki synchronization.

A Knowledge Context Pack exports a neutral index plus selected clean Concept Markdown. It includes all approved Concepts by default, with optional Course or manual filters, and excludes Source Notes, Cards, credentials, scheduler state, and diagnostics. Its README states that approved knowledge is not a mastery claim.

## Markdown Writing Settings

Mneme stores writer folder settings in plugin data:

- `conceptsFolder`: default `Mneme/Concepts`
- `cardsFolder`: default `Mneme/Cards`

These settings affect future explicit Markdown writes only. They do not move existing files and do not change review state.

## Source Note Hash

For each analyzed Source Note, store:

- sourcePath
- contentHash
- lastAiCaptureHash (optional; records the hash that completed proposal capture)
- mtime
- size
- lastAnalyzedAt

Skip the AI call only when `contentHash` matches `lastAiCaptureHash`. This lets a note indexed while AI Capture was disabled receive its first later capture without pretending the provider already ran.

## FSRS State

FSRS state belongs to Cards, not Concepts.

Concept Learning State is a reasoned aggregate of Card Memory States, assessment coverage, and explicit student signals. It is diagnostic and must not be presented as a mastery percentage or used as a Concept scheduler.

## Concept-first Extraction

v0.1 uses ConceptSuggestion[] as the AI output object.

Mneme does not use an explicit KnowledgeUnit layer in v0.1.

Duplicate or overlapping concepts are handled later through possible match, merge, or update flows.

## Scheduling Principle

Mneme uses card-level memory states for scheduling accuracy.

FSRS, or any scheduler, operates on individual Cards. Concepts are user-facing review units. Concept priority is computed by aggregating card-level memory states.

Task 012 introduced a scheduler abstraction. Task 015 adds an FSRS scheduler adapter behind that abstraction.

## FSRS Scheduler Adapter

`FsrsReviewScheduler` implements `ReviewScheduler` using `ts-fsrs`. `ReviewStateStore` remains scheduler-agnostic and persists the returned card-level memory state by stable `cardId`.

The concept queue remains concept-level. FSRS does not schedule Concepts directly.

Existing placeholder review states are treated conservatively: they are not converted into FSRS memory states. Users can run `Mneme: Clear Review History` before FSRS testing if they want a clean reset.

FSRS `dueAt` is the authority for Daily Review eligibility. New Cards enter Daily Review. Reviewed Cards enter Daily Review only when `dueAt <= now`.

Retrievability remains diagnostic for reviewed FSRS Cards. It may be useful as a secondary signal among already-due Cards, but it must not promote non-due Cards into Daily Review.

## FSRS Settings

Mneme stores minimal FSRS scheduler settings in plugin data alongside review state:

- `fsrsRequestRetention` controls the target recall probability. Higher retention usually means shorter intervals and more reviews.
- `fsrsEnableFuzz` spreads longer-interval reviews with small randomness to reduce review clustering.
- `fsrsMaximumInterval` caps how far into the future a Card can be scheduled.

Settings affect future reviews only; they do not rewrite existing Card review states. `Mneme: Clear Review History` resets stored review states while preserving settings. Daily Review still respects FSRS `dueAt`.

## Concept Memory Aggregation

Card-level memory state remains the source of scheduling truth.

Concept memory is an aggregation over a Concept's Cards. It distinguishes all-card diagnostics from the Daily Review subset:

- Daily Review Cards are new Cards and reviewed Cards whose `dueAt` is due.
- Non-due Cards remain visible in diagnostics.
- FSRS retrievability can be shown as diagnostic risk: `risk = 1 - retrievability`.
- Placeholder risk remains available for new, malformed, or non-FSRS diagnostic states.

## Concept Queue Ranking

The main review queue is concept-centered.

Concepts are ranked as groups of Daily Review-eligible Cards. The main queue shows only Concepts that contain due or new Cards.

Not-due-only Concepts are hidden from the main queue but visible in diagnostics. FSRS remains card-level; concept ranking never overrides FSRS scheduling.

Future modes may intentionally bypass `dueAt` for Cram, Exam Mode, Random Concept Draw, or Concept Activation. Daily Review must remain due-card driven.

Exam Attempts and Use activity never write FSRS history or change due dates. A due Card may be explicitly sent into normal Review Mode, where only the student's confirmed final rating updates FSRS.

## Concept Library

The Concept Library scans readable, identifiable `Concept.md` files and builds lightweight `ConceptSummary` records at runtime.

Concept recognition uses minimal frontmatter:

- `mneme_type: concept`
- `mneme_id`

The library displays clean learning information from Markdown sections such as Core Meaning and Why It Matters. It can open the Concept file and linked Card file, but it does not replace Markdown editing or store Concept content in `data.json`.

This scanner also prepares future AI Capture: existing Concept summaries can help avoid duplicates and support merge, update, and add-view proposals.

## Concept-First Capture

Source Note analysis and future vault scanning are Concept-first. They may create Concept-stage proposals, but they must not create Card proposals during the initial source-analysis step.

Card proposals are created later from written Concepts. They remain Inbox proposals until reviewed, approved, and explicitly written to `Card.md`.

Each generation run returns at most five non-duplicative Card proposals and a Coverage Map. Every proposed Card identifies its Card Grounding in approved Concept content. Missing knowledge must become a reviewed Concept proposal before a dependent Card can be written.

This preserves the product model:

```text
Source Note -> Concept proposal -> Concept.md -> Card proposal -> Card.md -> FSRS
```

See also: [Pre-FSRS Architecture Checkpoint](PRE_FSRS_CHECKPOINT.md).

See also: [Post-FSRS Integration Checkpoint](POST_FSRS_CHECKPOINT.md).

See also: [FSRS Integration Contract](FSRS_INTEGRATION_CONTRACT.md).

See also: [Concept-Source Model](CONCEPT_SOURCE_MODEL.md).

See also: [AI Capture Approval Flow](AI_CAPTURE_APPROVAL_FLOW.md).
