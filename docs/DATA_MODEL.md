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

`SourceAnalysisStore` persists `SourceAnalysisRecord` entries in plugin data. `Mneme: Analyze Current Note` currently updates source path, metadata, and content hash only; it does not generate Concepts, Cards, Inbox proposals, or Markdown.

AI Capture settings are stored in plugin data under `settings`. They configure a future provider boundary only:

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

These settings do not make `Analyze Current Note` call AI yet. Provider diagnostics must use log-safe configuration summaries and must not include raw API keys.

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

Inbox Refresh and `Mneme: Resync Mneme Index` reconcile plugin data with the current vault. Stale proposals, source analysis records, and Concept-source links that point to deleted vault files are pruned from `data.json`. Reconciliation never deletes user Markdown files; it only cleans index/cache/proposal state.

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

## File Layout

Recommended vault layout:

Mneme/
  Concepts/
    Information Gain.md
    Equivalence Partitioning.md

  Cards/
    Information Gain/
      card_001.md
      card_002.md

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

Controls review priority, desired retention, and random draw weight.

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

Optional multi-card wrapper markers:

- MNEME:CARD

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

## data.json

data.json may store:

- plugin settings
- AI provider settings
- source note hashes
- concept-source links
- pending suggestions
- FSRS card state
- review logs
- weak targets
- concept mastery cache
- card validity cache

data.json must not store:

- Concept Core Understanding as source of truth
- Card Front as source of truth
- Card Back as source of truth
- Card Rubric as source of truth

## Markdown Writing Settings

Mneme stores writer folder settings in plugin data:

- `conceptsFolder`: default `Mneme/Concepts`
- `cardsFolder`: default `Mneme/Cards`

These settings affect future explicit Markdown writes only. They do not move existing files and do not change review state.

## Source Note Hash

For each analyzed Source Note, store:

- path
- lastAnalyzedHash
- lastAnalyzedMtime
- lastAnalyzedSize
- lastAnalyzedAt

If hash is unchanged, skip AI analysis by default.

## FSRS State

FSRS state belongs to Cards, not Concepts.

Concept mastery is derived from the FSRS state and review logs of its Cards.

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

This preserves the product model:

```text
Source Note -> Concept proposal -> Concept.md -> Card proposal -> Card.md -> FSRS
```

See also: [Pre-FSRS Architecture Checkpoint](PRE_FSRS_CHECKPOINT.md).

See also: [Post-FSRS Integration Checkpoint](POST_FSRS_CHECKPOINT.md).

See also: [FSRS Integration Contract](FSRS_INTEGRATION_CONTRACT.md).

See also: [Concept-Source Model](CONCEPT_SOURCE_MODEL.md).

See also: [AI Capture Approval Flow](AI_CAPTURE_APPROVAL_FLOW.md).
