# ADR 0025: Manual Concept Creation Resumes a Durable Draft

## Status

Accepted — 2026-09-07

## Context

Direct Concept creation wrote Markdown, saved Source provenance, and cleared its
Composer draft separately. A failed provenance save triggered unconditional note
deletion, even if the save had already persisted or the learner had edited the
note. Failure to clear the draft could instead restore completed prose and create
a duplicate on retry. Name-conflict Merge also needed to retire the completed
Composer identity so a late autosave could not restore that draft.

## Decision

Direct learner authorship remains outside Inbox. A dedicated coordinator holds
the shared plugin-data mutation queue across preparation, Markdown creation, and
completion, using the same storage owner as Review and other stores:

1. Verify the persisted draft identity and input hash.
2. Allocate and save a `manualConceptWrite` receipt before Markdown I/O. It fixes
   the Concept ID, Concept and Card Group paths, expected Markdown hash, alias
   setting, and optional Source snapshot (path, hash, size, and modification time).
3. Create the note using the saved rendering inputs. If the target exists, require
   its whole-file hash to match. Never overwrite or delete a conflicting target.
4. In one state save, update Source provenance, mark the receipt written, remove
   the completed prose, retire the old draft identity, and discard the old manual
   conflict-Merge draft. Return a blank next draft with a new identity. Preserve
   its Source selection so the learner can continue authoring from that note.

Pending recovery uses the saved identity, paths, alias flag, and Source snapshot.
It does not rerun duplicate checks or require the Source Note to remain at its
original path. It either creates the missing note with the original hash or
finishes state for the matching existing note. A changed draft, edited/occupied
target, moved/in-use ID, changed rendering, or malformed receipt blocks recovery.
No Markdown deletion compensates for an uncertain state-save result, including
in the low-level compatibility helper.

Draft saves/clears compare the current identity inside the shared queue and
reject pending writes or stale callers. A completed receipt recognizes a repeated
request from its original draft. A deliberately new draft with the same prose
can create a distinct Concept. Manual name-conflict Merge blocks a pending direct
write, checks the draft identity, and rotates that identity in its existing
transactional completion. Merge retains its guarded rollback contract.

Inbox and manual Concept creation reserve each other's recorded Concept IDs and
new-note paths, including intents whose Markdown does not yet exist. Merge record
IDs remain reserved as well. The provenance reducer runs inside the coordinator;
it does not call a queued store while holding the queue.

Composer locks editing during creation and pending recovery. Resume skips fresh
preflight and uses the saved draft unchanged. Success adopts the returned next
draft without a second cleanup save. Closing waits for creation, invalidates alias
requests, and prevents late checks from opening dialogs or rendering a closed
View. A failed state load cannot expose an editable empty fallback.

## Compatibility and Limits

- Schema version remains 1. `manualConceptWrite`, `manualConceptDraftId`, and the
  optional draft `draftId` are additive. Legacy drafts receive a persisted identity
  before editing. Public Concept IDs and Markdown formats do not change.
- Receipts contain only hashes and locator/rendering metadata, never a copy of
  final learning prose. The existing temporary draft retains prose until the
  completion save; the next saved draft contains only blank fields and optional
  Source selection.
- This is explicit forward recovery, not a filesystem-wide atomic transaction or
  background retry. The shared queue coordinates one plugin instance only.
- Historical partial writes without receipts, external state replacement,
  corrupted metadata, conflicting external edits/moves, explicit developer data
  clearing, and downgrading to older writers can require manual reconciliation.
- Reconstructed storage/Vault fault tests and View method harnesses do not prove
  real Obsidian crash/restart or cross-platform acceptance.
