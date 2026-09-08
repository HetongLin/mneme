# ADR 0027: Card Deletion Persists Intent Before Markdown

## Status

Accepted — 2026-09-08

## Context

The Delete Card modal read cached Markdown, removed a Card block from that
snapshot, and overwrote the entire file. Edits between reading and writing were
lost. It then called a callback containing both tombstone persistence and view
refresh; any failure unconditionally restored the old file. Two delete windows,
a save that persisted and then rejected, or a failed refresh could therefore
restore a deleted Card while retaining its tombstone, or overwrite newer edits.

## Decision

Move deletion to `RecoverableCardDeletion`, holding the shared plugin-data queue
through intent, Markdown processing and state completion (ADR 0022).

1. Verify the loaded Card Group snapshot, recognition and unique valid Card
   block. Compare the entire loaded file with a fresh disk read, including owner,
   Rubric, Card type and surrounding prose. A changed snapshot requires refresh.
2. Save the optional `cardDeletion` record before changing Markdown. Its strict
   version-1 schema contains only Card ID, Vault-relative Markdown path,
   before/after hashes and creation time. No Card prose is copied into the record.
3. Use `Vault.process` to compare the current file inside the transform, then
   remove the selected block. Do not compensate with old Markdown on failure.
4. Save a content-free tombstone and clear active Card state/controls in the same
   save that removes the pending receipt. Preserve review events, other Cards,
   settings, proposals and drafts. A completed tombstone makes duplicate requests
   no-ops without touching Markdown.

The explicit **Resume Card Deletion** command reads the saved record without
requiring the Card to remain visible. The before hash allows the same operation
to proceed; the after hash allows state completion without another Markdown
write. Conflicting or missing files stop recovery. Startup reports pending work
without executing it. Allow one pending single-Card deletion at a time.

The modal now delegates deletion through `onConfirmed`; `onDeleted` only reloads
state and refreshes views. Refresh failure is reported separately after successful
deletion and cannot trigger Markdown rollback. Persistence errors retain pending
work, including when a save or process operation took effect before rejecting.

Pending deletion blocks ratings, control additions, ID migration and history
erasure for its Card. Tombstoned Cards also reject new control additions and
source-ID migration. Inbox/manual Card creation and merge/deletion preparation
reject overlapping pending paths. New Card allocation reserves persisted
tombstones and the pending deletion ID even if the caller's cache is stale.
Unrelated reviews and settings still use the shared queue normally.

## Compatibility and limits

This is an optional schema-version-1 field; existing Markdown and legacy Card
file recognition remain unchanged. Legacy Cards without a unique explicit block
ID still require repair before deletion. Whole-file comparison deliberately
requires refresh after unrelated file edits, rather than deleting from a stale
view. Completion removes the receipt entirely, so explicit Card-history erasure
does not leave a hidden deletion ID in that field.

Only new deletions have recovery metadata. Historical partial writes, moved or
externally edited recovery targets, and malformed records require inspection.
The shared queue does not serialize other plugins, sync clients or external
filesystem writers. `Vault.process` protects the transformation itself; it is not
a transaction spanning external writers and `data.json`. There is no automatic
undo or whole-file trash operation for deleting one Card block.

Tests cover before/after persistence and process failures, duplicate windows,
queued state changes, edit conflicts and modal refresh failures. Real Obsidian
restart and platform acceptance remain separate requirements.
