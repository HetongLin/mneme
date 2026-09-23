# ADR 0030: Incoming Merge Recovers Completion Without Replaying Markdown

## Status

Accepted — 2026-09-23

## Context

Exact-name conflict Merge writes one existing Concept, then completes an Inbox
Proposal or a Manual Concept draft and its provenance. In-memory compensation
cannot recover a terminated process. A Markdown write or state save can also
apply successfully and then reject. Blind compensation can make persisted
completion disagree with the Concept, or collide with subsequent learner edits.

## Decision

Keep preview zero-write. At confirmation, validate its exact Markdown and
normalized plugin-data snapshots under the shared mutation queue (ADR 0022).
Persist one version-1 `incomingConceptMerge` receipt before `Vault.process`.
It contains an operation ID, pending/written/not-applied status, target ID/path, timestamp,
before/after hashes, and an origin fingerprint. Manual origins may include their
draft ID and Source path/hash/mtime/size; Inbox origins identify their Proposal.
Hashes of JSON-escaped Markdown distinguish line endings. Never persist approved
Markdown, merged prose, or a complete replacement plugin-state snapshot here.

After the intent save succeeds, atomically compare and replace the reviewed
Concept. Save origin completion and the written receipt together. Do not
compensate Markdown after an ambiguous failure. Startup reports pending work;
the explicit **Resume Incoming Concept Merge** command uses fresh persisted data:

1. A written receipt returns completion without consuming the source again.
2. For pending work, verify the target identity, source fingerprint and other
   pending write/deletion/repair guards.
3. An exact after-hash completes state without writing Markdown. Rebuild from
   current data, retaining unrelated review events, settings and indexes. Manual
   recovery preserves existing Source-analysis metadata from subsequent work;
   differing Source evidence marks that record stale.
4. An exact before-hash, when distinct from the after-hash, marks the receipt
   `not-applied` and releases its locks. Preserve the source and editable Merge
   draft; require another reviewed preview. Keep the terminal receipt so an old
   confirmation cannot replay the abandoned operation.
   Recovery does not have the approved Markdown needed to safely reapply a write.
5. Different or missing Markdown, a changed source, or a malformed/unknown receipt
   stops recovery. Keep the receipt and current content for inspection. Equal
   before/after hashes take the state-completion path.

Source completion, provenance updates, draft removal/rotation and the written
receipt share one save. Repeated execution of the same operation and repeated
resume cannot append Views/Source notes or rotate the manual draft twice. Only
one Incoming Merge may remain pending; the next confirmed operation may replace
the last terminal receipt. A written receipt acknowledges historical completion,
not a claim that the file has remained unchanged since completion.

Pending source Proposals cannot be edited, replaced, rejected, cleared, written
separately or removed by cleanup. Matching manual and conflict drafts cannot be
edited or cleared. Concept creation cannot consume a pending manual source.
Overlapping Approved writes, Guided Merge, Concept deletion and Concept ID repair
are blocked by path or identity, including their recovery entry points. Ordinary
unrelated work may continue. After command recovery, matching open Merge views
show completion and manual Composers discard only the consumed draft identity.

## Compatibility and limits

The optional field keeps schema version 1 and existing Markdown formats. Old
data without this field needs no migration. Historical partial operations that
predate receipts cannot be inferred or repaired automatically.

This is a single-file completion protocol. Multi-file Guided Merge uses the separate journal protocol introduced by
[ADR 0031](0031-guided-merge-resumes-reviewed-file-writes.md) on 2026-09-24.
The queue coordinates participating Mneme state mutations, not external editors,
sync clients or other plugins. A file change after the final read cannot be made
atomic with the plugin-data save. Direct edits or other Markdown workflows can
invalidate a pending target; resume then stops without overwriting content.
There is no automatic rollback, force-complete, receipt editing UI or broad undo.

Deterministic fault tests reconstruct storage and services at write boundaries.
Real Obsidian process termination/restart and platform acceptance remain separate
checks; these tests do not establish power-loss durability of Obsidian storage.
