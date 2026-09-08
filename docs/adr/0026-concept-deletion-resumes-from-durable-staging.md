# ADR 0026: Concept Deletion Resumes from Durable Staging

## Status

Accepted — 2026-09-08

## Context

Concept deletion removed Markdown before separately saving Card tombstones. A
crash between these operations left active state without its files. A state save
that persisted and then rejected could instead trigger file restoration after
tombstones were saved. The final read before permanent deletion also could not
exclude an external edit during that gap.

## Decision

Use a dedicated deletion coordinator under the shared plugin-data mutation queue
(ADR 0022), with the same storage owner as other stores. The preparation service
retains Concept/Card Group ownership checks; it no longer executes deletion or
in-memory rollback.

1. Save a validated deletion intent before modifying any file. Its Concept ID,
   Card IDs, paths, operation ID and whole-file hashes fix the operation's scope.
2. Remove each prepared Related link through `Vault.process`, comparing its
   current content inside the transform. Recovery recognizes either the original
   or already-applied hash; conflicting content is preserved and reported.
3. Rename each owned file to `<original>.mneme-delete-<operationId>` in its own
   directory. This non-Markdown staging file is excluded from learning scans.
   Re-read the staged content. If an edit raced the rename, restore it to the
   original path when that path is free and stop without trashing the edit.
4. Persist the `staged` phase before moving that file to local Vault trash.
   A missing staged file in that phase is recognized as an already-applied trash
   operation, including when trash succeeded but its Promise rejected. Persist
   `trashed` afterward. Recreated original/staging paths cause a conflict.
5. In one state save, create Card tombstones, clear active Card/Concept controls,
   remove this Concept's provenance links and Source index IDs, and mark the
   deletion completed. Preserve review events, settings, proposals and drafts.

After interruption, the user explicitly runs **Resume Concept Deletion**. It
reads the durable record without requiring a scanner or an existing Concept
file. Startup only reports pending work; it does not resume destructive I/O.
One pending deletion is allowed at a time. No automatic file compensation runs
after uncertain persistence.

The optional schema-version-1 field `conceptDeletions` maps Concept IDs to strict
version-1 receipts. Pending receipts contain `createdAt`, `conceptPath`,
`operationId`, `cardIds`, `files` (path, staging path, hash, phase), and `related`
(path, before/after hashes). Completed receipts retain only Concept ID/path,
operation ID and timestamps. No Concept/Card prose is copied into receipts, and
completed receipts do not retain Card IDs after explicit review-history erasure.
Malformed records fail closed and are preserved for inspection.

Pending Card IDs cannot receive ratings. Composer and Inbox writers reject
pending/deleted Concept targets; merge preparation does likewise. New Concept ID
allocation reserves completed IDs and avoids pending deletion paths. Pending
creation/write receipts affecting deletion targets must complete first. Existing
proposal and draft prose is never silently discarded as reconciliation.

## API and recovery boundaries

Use disk `Vault.read`, `Vault.rename` (without FileManager link rewriting), and
`Vault.trash(file, false)`. Local trash is deliberate: these APIs are available at
the current minimum Obsidian 1.5.0, while `FileManager.trashFile` requires 1.6.6.
Files retain the staging suffix in local trash; restoring bytes manually does not
undo Mneme tombstones or Related changes.

The queue serializes Mneme writers, not external processes or sync clients.
Random staging names and destination checks reduce collisions, but the Obsidian
rename contract does not promise an atomic compare-and-rename. Local trash
preserves bytes if an edit races the final check. Changed/moved files, altered
Related content, or manually removed staged files can require manual inspection;
the coordinator never guesses new paths or overwrites conflicts. Pre-existing
partial deletions without receipts cannot be recovered automatically.

In-memory failure tests cover operation and persistence boundaries. Real
Obsidian crash/restart and local-trash behavior still require disposable-Vault
acceptance on supported platforms.
