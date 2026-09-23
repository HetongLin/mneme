# ADR 0031: Guided Merge Resumes Reviewed File Writes

## Status

Accepted — 2026-09-24

Supersedes the in-memory compensation protocol for ordinary Guided Merge in ADR
0003. Incoming Merge retains its single-file protocol in ADR 0030.

## Context

Guided Merge can update two Concepts, two Card Groups, and multiple Related
neighbors. A terminated process can leave only some files updated. Neither a
content-free receipt alone nor in-memory rollback can reconstruct the remaining
reviewed writes after restart. Rolling back after an uncertain state save can
also undo Markdown whose state migration already completed.

## Decision

Keep preparation and impact preview zero-write. Under the shared plugin-data
mutation queue, confirmation revalidates the reviewed file/state snapshots,
Card/perspective relocation and Related resolution. Save the exact before/after
Markdown and Related checks in a separate version-1 recovery journal at:

`<plugin directory>/guided-merge-recovery/<operation ID>.json`

The normal plugin directory is `.obsidian/plugins/mneme`; respect the configured
Obsidian plugin directory. This JSON file is outside Markdown scanning. It is a
recovery copy of an explicitly confirmed operation, never the content source of
truth, a content index or a second editing surface. Never put these snapshots or
a replacement plugin-data object in `data.json`.

Read back and validate the journal before saving the optional version-1
`guidedConceptMerge` receipt in `data.json`. The receipt contains the operation ID,
`pending`/`written` status, creation time, participant IDs/paths, protected paths,
Card IDs, exact before/after hashes for each write, journal hash, and the hash of
participant Source links. Hash JSON-escaped strings to distinguish line endings.
Operation filenames have a restricted alphabet; existing entity IDs retain their
legacy spelling. Existing journals may only be reused with identical bytes.

Startup reports pending work. **Resume Guided Merge** reconstructs completion
from persisted data and the journal:

1. A written receipt acknowledges past completion and only retries journal
   cleanup. It never reapplies files or state, even after later learner edits.
2. For pending work, validate the journal and check every affected file before
   writing anything. Each must exactly match its reviewed before or after value.
   Missing files, third content, damaged snapshots and incompatible pending
   authoring/deletion/identity operations stop recovery without compensation.
3. Recheck participant Source links, retirement state and actionable proposals
   for the retiring Concept. Verify Related inventory/identities/targets using
   original snapshots for affected files and current data for all other files;
   use current native link resolution. Recheck relocated references as well.
4. Skip files already at their after value. For remaining files, atomically
   compare the current value to before and write the approved after value.
   Recheck native Related resolution inside each synchronous transform.
5. Read every result again and recheck Related dependencies. Rebuild Source-link,
   linked-Concept, pause, duplicate-dismissal and Merge Record migrations from
   current plugin data. Preserve current Card IDs, FSRS state, events, controls,
   settings and other unrelated state. Save this migration and `written` together.
6. Remove the journal after successful completion. Cleanup failure does not undo
   completion; an explicit repeat of Resume retries cleanup.

Only one Guided Merge may be pending. The next confirmed operation may replace
the last written receipt. Repeating the same plan is idempotent, and changing its
confirmed survivor Markdown cannot silently replace a pending operation.

Block overlapping Inbox/Manual writes, Incoming/Guided Merge, deletion, ID repair
and provenance changes by protected paths/IDs, including recovery entry points.
Reserve participant/Card IDs. Index reconciliation defers affected Source links
and missing Source-analysis records. New actionable proposals for the retiring
Concept cannot be introduced through the proposal store. A matching open Merge
View adopts completion only when both participant IDs and paths match, and
invalidates earlier asynchronous UI work.

## Compatibility and limits

Schema version stays 1; the receipt is optional. Existing Markdown formats and
Card content remain unchanged. Old partial operations without a journal and
receipt cannot be automatically inferred or recovered.

Snapshots contain the reviewed learning content in plain JSON while retained;
they inherit the Vault/plugin directory's filesystem and sync behavior. Normal
completion removes them. A journal saved before its intent failed to persist can
remain orphaned; no automatic garbage collection guesses whether that snapshot
is safe to delete. Retain and inspect it until its operation is understood. There
is no retention deadline, broad undo, force completion or conflict-resolution UI.

Recovery conservatively stops on changes to Markdown inventory, Concept identity,
Related targets or relevant native resolution, even when a change appears
unrelated. Ordinary body edits outside the affected files that do not alter those
checks remain possible. Direct editing, sync, other plugins and Markdown editing
workflows outside the guarded coordinators can invalidate pending content.
The queue does not make multiple files and `data.json` atomic, and cannot exclude
external edits after final verification. This protocol does not claim filesystem
fsync/power-loss durability or atomicity across devices.

Deterministic tests reconstruct storage, journal and service instances across
write boundaries. Real Obsidian process termination/restart, metadata-cache timing
and platform acceptance remain separate validation work. This change is not
installed into a personal or existing acceptance Vault as part of these tests.
