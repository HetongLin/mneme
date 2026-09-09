# ADR 0028: Card ID Repair Resumes Without Markdown Rollback

## Status

Accepted — 2026-09-09

## Context

The Card ID modal overwrote a cached Markdown snapshot, then called a callback
that both migrated review state and refreshed the view. Any callback failure
restored the old file, even if state migration had already persisted. A refresh
failure could therefore leave Markdown using the old ID while FSRS state and
review events used the new ID. A crash between file and state writes had no
recovery metadata.

## Decision

`RecoverableCardIdRepair` owns the complete operation under the shared plugin-data
queue (ADR 0022). It preserves the ID-only editing contract from ADR 0020.

1. Compare the entire loaded Card file against a fresh read. Validate the target
   block, ID syntax, current Card identities, deletion state, destination history,
   and overlapping authoring receipts. Explicit IDs must still be duplicated;
   ordinary valid IDs are immutable. Missing IDs use the exact path/index fallback.
2. Save a strict `cardIdRepairs[newCardId]` pending record before Markdown. It
   contains version, status, IDs, path, block index, migration policy, before/after
   hashes and creation time. No Card prose is stored.
3. Compare Markdown again inside `Vault.process` and change only the ID. Never
   write an old snapshot as compensation for an uncertain operation.
4. Migrate fallback FSRS state, events, deferral, suspension and retirement together
   with marking the receipt completed in one save. Duplicate-ID replacement keeps
   the old shared state. Destination state or event-only history blocks both modes.
5. Close the modal after persistence. Reloading state and refreshing views happen
   separately; their failure reports a refresh problem and cannot undo the ID.

Only one repair may be pending at a time. **Resume Card ID Repair** explicitly
resumes after restart without a visible Card or the old dialog. Startup only
reports pending work. A before hash permits the original transformation; an after
hash permits state completion without repeating the Markdown write. A conflicting
or missing target stops recovery and preserves current content. Fresh identity
checks use Obsidian YAML parsing and disk reads rather than a stale view ID set.

Completed records remain as content-free identity provenance. They make an exact
repeat request a no-op, reserve the new ID, and prevent stale actions from
recreating the migrated fallback state. Duplicate-ID records do not retire the
shared old ID. Ratings, control changes, history erasure, deletion, authoring ID
allocation and overlapping merge/write paths enforce the relevant guards.

## Compatibility and limits

`cardIdRepairs` is optional within schema version 1. Existing Markdown, review
formats and valid IDs are unchanged. Completion preserves proposals, drafts,
settings and unrelated history. Resetting review history does not discard repair
provenance or make repaired IDs available for reuse.

A migrated path/index fallback remains retired even if later external edits put a
different unlabelled Card in that slot. Such Cards require inspection and an
explicit stable ID; silently attributing stale reviews to the new content is not
safe. Completed records currently have no pruning or undo workflow.

The shared queue coordinates participating Mneme state mutations, not sync or
other filesystem writers. Fresh scans cannot reserve IDs against external changes
between files. Other edits to a pending target deliberately cause a recovery
conflict. Concept ID repair still uses its older multi-file write/compensation
protocol and requires a separate audit, including its interaction with pending
Card work. This ADR does not make that workflow crash-safe.

Tests use cloned in-memory storage, fault injection and a lightweight modal
harness. Real Obsidian YAML, UI, crash/restart and platform acceptance remain
separate requirements.
