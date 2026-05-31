# Concept-Source Model

Mneme's durable knowledge model is:

```text
Source Note <-> Concept -> Card -> FSRS
```

## Source Note

A Source Note is an existing user-authored Obsidian note.

It may:

- produce new Concept proposals
- provide source evidence for existing Concepts
- add a new view to an existing Concept
- suggest new Cards for an existing Concept
- suggest a merge with an existing Concept

Source Notes are not review units.

## Concept

A Concept is the learning object.

It may:

- come from multiple Source Notes
- accumulate multiple views
- accumulate evidence over time
- have multiple Cards
- be updated, merged, edited, or marked exploratory

Concepts are not fixed one-time AI artifacts.

## Card

A Card is a review probe for a Concept.

It may:

- be generated from an approved Concept
- be edited later
- be revised, split, merged, or retired
- enter FSRS only after approval and Markdown write

Cards are not the primary knowledge object. They are tools for testing Concepts.

## FSRS

FSRS schedules Cards only.

This model does not alter the FSRS scheduling contract. Concepts group Cards for user-facing review, but scheduling remains card-level.

## SourceNote To Concept Many-To-Many

One Source Note can link to many Concepts.

One Concept can link to many Source Notes.

The relation carries metadata:

- relation type
- evidence
- source hash
- approval status
- timestamps

## Source Analysis Records

Source analysis state lives in plugin data, not in `Concept.md` or `Card.md`.

`SourceAnalysisRecord` tracks path, `mtime`, size, content hash, linked Concept ids, pending proposal ids, and analysis status.

Task 019 only indexes this source state. Future tasks will use it to decide whether AI proposal generation is needed.

## Inbox As Knowledge-Change Approval Layer

Inbox stores AI-generated knowledge change proposals, not final knowledge.

`KnowledgeProposalStore` keeps these proposal records in plugin data. The Inbox is a long-term approval layer for Concept and Card evolution, not just first-time generation.

Possible proposal kinds:

- `new_concept`
- `link_existing_concept`
- `merge_concept`
- `add_view`
- `update_concept`
- `new_card`
- `revise_card`
- `split_card`
- `merge_card`
- `retire_card`

Rules:

- Suggested proposals cannot become permanent Markdown without approval.
- Accepted Concept proposals explicitly write `Concept.md`.
- Accepted Card proposals explicitly write `Card.md`.
- Only written Cards enter FSRS.
- Future AI edits also go through proposal approval.
- Acceptance is the explicit user action that validates and writes supported proposal kinds.

Proposal payloads now describe draft Concept views, Concept-source links, and Card changes. The current detail review UI uses structured fields for `new_concept` and `new_card`, with raw JSON kept under Advanced for debugging and fallback editing.

The first Markdown writer supports `new_concept` and `new_card` only. Unsupported proposal kinds remain in the Inbox until future writers can preview and patch existing Markdown safely.

Active Inbox contains actionable proposals with `suggested`, `opened`, `edited`, or `stale` status. Rejected and written proposals move to History. Clearing Inbox History removes those proposal records from plugin data, but never deletes generated `Concept.md` / `Card.md`, settings, review states, source analysis records, or Concept-source links.

## Concept-First Capture

Source Note analysis is Concept-first. It may suggest new Concepts, links to existing Concepts, merges, updates, or additional views, but it must not create Card proposals in the same initial step.

Cards are generated in a separate stage after a Concept exists as approved/written Markdown. Card proposals then enter the same Inbox approval lifecycle before any `Card.md` write occurs.

This keeps Concepts and Cards separately reviewable and editable, and prevents raw Source Note analysis from becoming a direct Card dump.

## Readable And Identifiable Markdown

`Concept.md` is a clean learning note plus a thin identity layer. Generated Concept notes include minimal frontmatter such as `mneme_type: concept`, `mneme_id`, and `mneme_version`, then present Core Meaning, Views, Review Cards, Source Notes, and Related Concepts as editable reading sections.

`Card.md` is the concept's review-card file. Generated Card groups include minimal frontmatter such as `mneme_type: card_group`, `mneme_concept_id`, and a Concept link, then use Mneme's existing card marker syntax.

Concept notes link to their Card file, and Card files link back to their Concept. Machine metadata stays in plugin data, not in the main Markdown body.

## Concept Library

The Concept Library is a scanner and browser over approved `Concept.md` files. It recognizes Concepts through minimal Mneme frontmatter, extracts readable sections such as Core Meaning and Why It Matters, and opens the underlying Markdown for editing.

It does not create or modify Concepts. It prepares later AI Capture work by giving Mneme a lightweight view of existing Concepts before proposing duplicates, merges, updates, or additional views.

## Runtime Concept-Source Indexing

`ConceptSourceLinkStore` persists approved many-to-many links in plugin data.

After a successful `new_concept` Markdown write, Mneme can create approved `ConceptSourceLink` records from the proposal's source links or from the proposal's source note metadata. It also updates `SourceAnalysisRecord.linkedConceptIds` for linked source notes.

These links are index/state metadata. They help Mneme remember which Source Notes support which Concepts, but editable `Concept.md` and `Card.md` remain the content source of truth.

## Living Assets

Concepts and Cards are living, editable, evolvable learning assets.

Manual user edits are always allowed because Markdown is the content source of truth.

AI-assisted edits must be proposed and approved before writing.
