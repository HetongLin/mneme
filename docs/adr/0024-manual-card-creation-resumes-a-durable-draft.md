# ADR 0024: Manual Card Creation Resumes a Durable Draft

## Status

Accepted — 2026-09-07

## Context

Manual Card creation wrote Markdown before clearing the Composer draft. If the
clear failed, reopening the plugin restored the old text and another Create
allocated a second Card ID. Disabling the submit button only protected one View
lifetime. Delayed saves from an older Composer could also resurrect completed
drafts.

## Decision

Direct authorship remains outside Inbox. A dedicated coordinator uses the same
shared plugin-data mutation queue as approved writes:

1. Load the current draft and verify its stable `draftId` and input hash.
2. Validate the Card Group and save `manualCardWrite` before any Markdown write.
   The record reserves one Card ID and target path and retains the Concept ID,
   display title, and link path needed to reproduce the original rendering.
3. Create the group or append the fixed-ID Card inside `Vault.process()`.
4. In one state save, mark the operation written, remove the draft prose, and
   rotate the current `manualCardDraftId` to a new UUID.

Recovery hashes only the identified Card and its Concept owner. If that Card is
already present, resuming only completes state; unrelated Card appends survive.
Otherwise it uses the recorded identity, path, and rendering metadata. A changed
Card, missing previously existing group, moved/in-use ID, changed draft, or
malformed receipt blocks recovery instead of allocating a replacement.

Composer offers `Resume Creation` for a pending operation and disables editing.
The original Concept selection is retained even when it is no longer in the
library; recovery can check the saved target without selecting a different
Concept. A failed state load cannot expose an empty editable form or clear the
stored draft on close. Success resets the View from the coordinator's returned
next draft, with no separate cleanup save.

The current draft identity remains in state even when the form is empty. Draft
saves and clears compare it inside the shared queue, and reject both stale
identities and pending writes. The latest completed receipt handles a repeated
request from its original draft; after later operations replace it, the stale
draft identity still blocks replay. An intentionally new draft with identical
text is a distinct operation and may create a new Card.

Inbox and manual writers include each other's reserved Card IDs when allocating
new IDs. Card Group paths remain shared append destinations, not unique paths
per Card.

## Compatibility and Limits

- Schema version remains 1. `manualCardDraftId`, `manualCardWrite`, and the draft's
  optional `draftId` are additive; legacy drafts acquire a persisted identity
  before editing. Card Markdown and public Card IDs do not change.
- Receipts contain hashes and metadata, never Card Front, Back, Rubric, or a
  rendered Markdown copy. The existing temporary draft is retained only until
  completion. Unknown/malformed recovery metadata survives normalization and
  blocks unsafe writes.
- This is forward recovery through an explicit user action, not one atomic
  filesystem transaction. It depends on readable plugin state and the current
  plugin instance's queue. Conflicting external changes can require manual
  reconciliation; the coordinator does not overwrite them or guess a new path.
- Historical partial writes without a receipt, external state replacement,
  explicit developer data clearing, and downgrading to a writer that ignores
  these fields remain outside the contract.
- Reconstructed storage/Vault fault tests do not establish real Obsidian
  crash/restart or cross-platform acceptance.
