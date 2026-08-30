# ADR 0021: Name-Conflict Merge Defers All Writes

## Status

Accepted

## Context

At the final write gate, a new Concept may conflict with an existing Concept by
Title, optional English Alias, or Markdown path. Mneme offers Merge, Refine Name,
Keep Both, or Cancel.

The earlier implementation handled Merge by first writing the incoming Concept
as a separate approved Concept, allocating a `-2` or later path when necessary,
and then opening Guided Merge. Closing the Merge workspace therefore left a
separate Concept behind even though the learner had never confirmed either Keep
Both or Merge.

Inbox proposals and Manual Concept drafts already provide durable pending state.
A name-conflict decision does not need a temporary Concept file.

## Decision

Name-conflict Merge is a draft-based, zero-write workflow:

- choosing Merge does not create a Concept, Card Group, Redirect Note, random
  identity, or provenance record;
- the written existing Concept keeps its stable identity;
- the incoming Inbox proposal or Manual Concept draft remains the source of the
  incoming learning content until final confirmation;
- Back, Cancel, and closing the Merge workspace perform no knowledge writes;
- Inbox proposals remain actionable in Inbox;
- Manual Concept content remains in the auto-saved Create Concept draft;
- only `Confirm Merge` may update the existing Concept and associated plugin
  state;
- successful confirmation marks the Inbox proposal handled or clears the Manual
  Concept draft;
- failed or stale confirmation preserves all source and merge drafts;
- Keep Both remains the only conflict decision that may allocate a `-2`, `-3`,
  or later Markdown path.

The conflict Merge workspace may persist its editable learning-content draft.
Its zero-write preview is always rebuilt from current Vault and plugin state
rather than persisted.

Ordinary Guided Merge between two already-written Concepts remains unchanged:
it may produce a Redirect Note and migrate Card/FSRS state after explicit final
confirmation.

## Consequences

- Closing a conflict Merge can no longer create an accidental duplicate.
- Inbox approval remains truthful: the proposal is not accepted before the
  learner's chosen resolution succeeds.
- Manual Concept authorship retains its draft until the chosen operation
  commits.
- Conflict Merge needs a distinct preparation and commit path because the
  incoming side has no durable Concept identity, path, Card Group, or history.
- Merge-draft persistence belongs in `data.json`; Concept content remains
  authoritative only after confirmation writes Concept Markdown.
