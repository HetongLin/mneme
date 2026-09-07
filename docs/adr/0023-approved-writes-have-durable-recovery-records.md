# ADR 0023: Approved Writes Have Durable Recovery Records

## Status

Accepted — 2026-09-06

## Context

Inbox acceptance wrote Markdown before persisting provenance and the proposal's
`written` status. A failed completion save left the proposal actionable. Retrying
could create a second Concept path or assign another Card ID. An in-memory guard
cannot resolve the same uncertainty after reload. Rolling back Markdown can also
overwrite edits made after the original write.

## Decision

The approved-write coordinator holds the shared plugin-data queue from reading
the current proposal through completion. It handles `new_concept`, `new_card`,
`update_concept`, `link_existing_concept`, and `add_view` uniformly:

1. Validate the approved proposal and prepare its single Markdown target.
2. Save an optional versioned `writeReceipt` on the proposal before Markdown I/O.
3. Create the reserved file, append a fixed-ID Card atomically, or apply a
   Concept snapshot inside `Vault.process()`.
4. Save the proposal's `written` status, source links, and source-analysis
   updates in one plugin-data mutation.

The receipt contains a proposal-input hash, target path, write mode, fixed entity
ID when applicable, expected content hash, optional original-content hash, and
timestamp. It contains no Markdown or Card Front/Back. Other pending receipts
reserve their Concept paths and entity IDs even before files exist.

Recovery is explicit through Inbox acceptance. It first checks the existing
target. An already-applied write completes only its state; an unapplied write
uses the original path and identity. Card recovery hashes the identified Card
and its Concept owner so unrelated Card appends do not prevent recovery. A
different Card with the same ID, conflicting Concept content, changed proposal,
or invalid receipt blocks the retry without overwriting content or allocating
another destination.

An interrupted approval remains visible in Inbox. While a receipt exists,
editing and rejection are unavailable: an uncertain write must not become a new
operation. Old UI snapshots cannot replace its receipt or downgrade its status.
After completion, the payload is discarded and the small completion record
remains for repeat requests. Ordinary index reconciliation retains receipts,
including when their original Source Note is missing, and removes other stale
proposals only if they still match the inspected snapshot.

## Compatibility and Limits

- The existing `data.json` schema version remains 1; `writeReceipt` is additive
  and absent in historical proposals. Markdown syntax and IDs do not change.
- Receipt validation occurs at recovery. Normalization retains unknown or
  malformed receipts so they cannot silently become permission for a new write.
- Historical partial writes without a receipt cannot be identified reliably;
  this change does not infer ownership from a matching title or learning text.
- A failed save after writing may already have completed on disk. Retry checks
  persisted status/content rather than assuming every thrown save made no change.
- This is forward recovery, not an atomic filesystem transaction. It depends on
  readable persisted metadata, the same plugin instance's queue, and retained
  identity markers. External deletion, conflicting edits, moved targets, or
  rendering-setting changes can require manual reconciliation. There is no
  automatic conflict dismissal or content rollback.
- Explicit developer data clearing and downgrading to a writer that ignores
  receipts are outside this recovery contract.
- Manual Card Composer uses a separate direct-authorship coordinator and draft
  identity, described in [ADR 0024](0024-manual-card-creation-resumes-a-durable-draft.md).
