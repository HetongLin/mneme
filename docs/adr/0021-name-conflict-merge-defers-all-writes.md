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

## Async session boundaries — 2026-09-10

Each conflict-Merge session activation has a revision, including reopening the
same key or session object. Draft loads, AI responses, preview preparation,
confirmation results and editor callbacks may affect the view only while both
their session and revision remain current. Replacing a session invalidates old
work before loading the new draft. A failed save before switching retains the
current in-memory edits; an obsolete load cannot overwrite the newer draft.

Keep the operation lock from preparation through the confirmation dialog and
commit. Disable draft editing during that interval, and pass the confirmed plan
and original session explicitly to execution. The completion callback always
receives that original session. Closing invalidates UI callbacks immediately;
closing or switching after a commit has started waits for its completion. This
does not cancel or undo an already-confirmed write. Completed drafts are not
auto-saved again: the service already removes them in its state commit.

No new persisted fields are required. These View guards do not provide durable
Merge recovery across process termination, change the underlying transaction
protocol, or cover the separate Guided Merge View. Real Obsidian dialog/popout
and restart acceptance remains separate from deterministic lifecycle tests.


## Incoming write ownership — 2026-09-19

An Inbox proposal with any `writeReceipt` is already owned by the approved-write
recovery workflow. Conflict Merge must refuse it even if its status is still
`approved` and the caller has its current timestamp. This includes malformed
receipts: Merge must not discard the record, complete the proposal, or repurpose
its incoming content. Finish or diagnose that write through Inbox first. A
proposal that acquires a receipt after preview is rejected by the existing exact
plugin-state snapshot check at execution.

Validate the target using the current leading frontmatter's unique Concept type
and ID. A matching line in body text or a code fence is not an identity check;
changed types and duplicate ID fields must block preparation. The scalar reader
is shared with ID repair. Source and Merge drafts remain intact on rejection.
This changes preparation guards only, not the underlying commit/rollback or
cross-process recovery protocol.
