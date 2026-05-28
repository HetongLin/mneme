# Data Model

## Principle

Markdown is the source of truth for user-facing learning content.

data.json stores state, indexes, review logs, hashes, pending suggestions, FSRS state, and caches.

Do not duplicate Concept or Card content in data.json.

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

Required frontmatter fields:

- mneme_type: concept
- concept_id: string
- importance: low | normal | high | critical
- learning_mode: mastery | recall | exploratory
- review_policy: fsrs | random_only | paused
- status: active | paused | archived

Recommended sections:

- Core Understanding
- Source Views
- Common Mistakes
- Related Concepts
- Cards

Example structure:

---
mneme_type: concept
concept_id: c_information_gain
importance: high
learning_mode: recall
review_policy: fsrs
status: active
---

# Information Gain

## Core Understanding

Information gain measures the reduction of uncertainty after splitting a dataset by an attribute.

## Source Views

- [[Decision Tree Notes]]: introduces the basic definition.
- [[Exam Mistakes]]: adds the bias toward many-valued attributes.

## Common Mistakes

- Confusing information gain with classification accuracy.
- Forgetting that information gain tends to favor attributes with many values.

## Cards

- [[Mneme/Cards/Information Gain/card_001]]
- [[Mneme/Cards/Information Gain/card_002]]

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

- mastery: must be mastered
- recall: should be actively recalled
- exploratory: only for low-stakes exploration

### review_policy

Controls whether the concept enters scheduled review.

- fsrs: cards enter FSRS review
- random_only: concept enters Random Concept Draw only
- paused: excluded from review queues

## Card.md

Card.md is the source of truth for review UI content.

Required frontmatter fields:

- mneme_type: card
- schema_version: 0.1
- card_id: string
- concept_id: string
- card_type: definition | misconception | comparison | application
- targets: string[]
- status: active | suspended | archived | invalid
- source_note: string

Required marker sections:

- MNEME:FRONT
- MNEME:BACK

Recommended marker sections:

- MNEME:RUBRIC

Optional multi-card wrapper markers:

- MNEME:CARD

Example structure:

---
mneme_type: card
schema_version: 0.1
card_id: card_information_gain_001
concept_id: c_information_gain
card_type: misconception
targets:
  - bias_many_values
status: active
source_note: Machine Learning/Decision Tree.md
---

# Information Gain: Many-valued Attribute Bias

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
- source note hashes
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

FSRS, or any scheduler, operates on individual Cards. Concepts are user-facing review units. Concept priority will be computed later by aggregating card-level memory states.

Task 012 introduces a scheduler abstraction; it does not implement FSRS yet.

## Concept Memory Aggregation

Card-level memory state remains the source of scheduling truth.

Concept memory is an aggregation over a Concept's Cards. Mneme estimates concept priority from due and new Cards, weakest card risks, and lapse history.

This is currently a placeholder risk model. Future FSRS integration should replace placeholder card risk with FSRS retrievability: risk = 1 - retrievability.

## Concept Queue Ranking

The main review queue is concept-centered.

Concepts are ranked by aggregated card-level memory risk. The main queue shows only reviewable Concepts with due or new Cards.

Not-due-only Concepts are hidden from the main queue but visible in diagnostics. FSRS remains card-level; concept ranking is an aggregation layer.

See also: [Pre-FSRS Architecture Checkpoint](PRE_FSRS_CHECKPOINT.md).
