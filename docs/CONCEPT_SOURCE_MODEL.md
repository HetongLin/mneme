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
- Approved Concept proposals can explicitly write `Concept.md`.
- Approved Card proposals can explicitly write `Card.md`.
- Only written Cards enter FSRS.
- Future AI edits also go through proposal approval.
- Approval and Markdown writing are separate actions.

Proposal payloads now describe draft Concept views, Concept-source links, and Card changes. The current detail review UI uses a temporary JSON editor; future UI can replace it with structured Concept/Card forms and Markdown diff preview.

The first Markdown writer supports `new_concept` and `new_card` only. Unsupported proposal kinds remain in the Inbox until future writers can preview and patch existing Markdown safely.

## Runtime Concept-Source Indexing

`ConceptSourceLinkStore` persists approved many-to-many links in plugin data.

After a successful `new_concept` Markdown write, Mneme can create approved `ConceptSourceLink` records from the proposal's source links or from the proposal's source note metadata. It also updates `SourceAnalysisRecord.linkedConceptIds` for linked source notes.

These links are index/state metadata. They help Mneme remember which Source Notes support which Concepts, but editable `Concept.md` and `Card.md` remain the content source of truth.

## Living Assets

Concepts and Cards are living, editable, evolvable learning assets.

Manual user edits are always allowed because Markdown is the content source of truth.

AI-assisted edits must be proposed and approved before writing.
