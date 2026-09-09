# ADR 0029: Concept ID Repair Resumes Both Markdown Files

## Status

Accepted — 2026-09-09

## Context

The Concept ID modal changed Concept Markdown, changed the linked Card Group,
then called a state-migration callback. On failure it unconditionally restored
both old snapshots. A migration save that persisted and then rejected could leave
pause state at the new ID while both files reverted. Interruptions between the two
file writes had no recovery metadata. A pending Card ID repair could also compete
for the same Card Group.

## Decision

`RecoverableConceptIdRepair` owns one operation under the shared plugin-data queue
(ADR 0022), preserving the ID-only content safeguards in ADR 0020.

1. Read fresh Concept/Card Group content and current identity references. Validate
   the selected identity and link, exclusive Card Group ownership, current ID
   collisions and pending writes/deletions. Explicit IDs must still be duplicated.
   Another unlinked Card Group claiming the new ID or an orphan source owner also
   blocks repair; an absent Concept alone does not establish exclusive ownership.
2. Persist `conceptIdRepairs[newConceptId]` before changing either file. The strict
   version-1 record contains status, old Concept/old review/new IDs, migration
   policy, creation time, and separate path/before-hash/after-hash records for the
   Concept and optional Card Group. No Markdown prose is copied into plugin data.
3. Inspect both files and recheck ownership before proceeding. Each before hash
   permits an ID-only transform with `Vault.process`; each after hash means that
   file has already completed. Changed or missing files stop recovery. Once both
   current files match their after hashes, finish state migration and mark the
   receipt completed in one save. Never compensate with old Markdown.
4. Reload state and refresh the library after persistence. Refresh failures cannot
   undo either file. **Resume Concept ID Repair** explicitly resumes pending work
   without the original dialog. Startup reports pending work without writing.

Keep the existing migration policy: duplicate-ID repair retains shared old pause
state; missing-ID repair moves only an unclaimed Card Group owner's pause when
its ID changes. If the Card Group already owns the chosen new ID, retain its pause
and skip an unchanged group file. A matching completed creation receipt for that
same Concept path does not prevent re-adopting its owner. Source provenance,
review events, Card IDs, proposals and drafts remain unchanged; this is not a
blanket replacement of every occurrence of an old Concept ID.

Pending repair blocks mutations to its old/new Concept identities and both paths.
Card ID repair, Card/Concept deletion, authoring, ID allocation and merge enforce
these guards. Legacy pause cleanup at Review View startup must wait while repair
is pending. After completion, normal legacy-pause cleanup policy still applies.

Allow one pending Concept repair. Completed records retain content-free identity
provenance: the new ID stays reserved, a migrated orphan owner cannot be recreated
by stale pause actions, and exact repeat requests verify both current after hashes
before returning success. Shared old duplicate IDs remain active.

## Compatibility and limits

The new field is optional in schema version 1. Existing Markdown and state formats
remain readable. Completed records currently have no pruning or undo workflow.
The queue coordinates participating Mneme operations; scans and `Vault.process`
do not form a transaction with external plugins, sync or filesystem writers.
Conflicting files/references, malformed records and historical partial repairs
without receipts require inspection, not automatic rollback or owner guessing.

### Index reconciliation addendum — 2026-09-09

Resync must not discard Source evidence simply because a repaired identity is
absent from the Concept scan. For removal candidates caused by a missing Concept,
the link store reads current repair receipts inside the shared mutation queue.
If any pending or completed receipt references the link's Concept ID as an old
Concept ID, old review owner, or new ID, keep the entire link and report deferred
cleanup. This includes repairs completed after the scan and duplicate-ID repairs;
the receipt does not establish which Concept should inherit shared provenance.
Resync and Inbox display the unresolved ownership message, rather than reporting
that all indexes match the Vault.

This is deliberately conservative: completed receipts also protect these missing
identities on later scans, even if a file was subsequently removed externally.
Normal missing-Source cleanup for a Concept present in the scan is unchanged.
Explicit removal remains effective; stale scans cannot resurrect removed links.
Source records for existing files keep their original `linkedConceptIds`. There
is no automatic link rekeying, alias resolution, or global replacement in creation
receipts, proposals, drafts, or history. An explicit ownership-resolution workflow
remains future work. No additional persisted fields or schema version changes.

Real Obsidian YAML/UI/restart and platform acceptance remain outstanding;
deterministic fault tests use in-memory Vaults and cloned storage.

### Proposal targets and Merge drafts addendum — 2026-09-10

After duplicate-ID repair, the old ID can uniquely identify a different Concept
from the one that supplied an earlier proposal. Uniqueness after repair is not
proof of the proposal's intended target. Before starting a write without an
approved-write receipt, reject Concept updates, added Views, and Source links
whose target is a completed duplicate repair's old Concept ID. Keep the proposal
and its text intact. Source paths on these proposal kinds refer to evidence notes
and cannot establish the destination Concept.

Generated Card proposals already record the generating Concept as `sourcePath`.
For a repaired duplicate ID, require that path to match the unique scanned Concept
and differ from every repaired file associated with that old ID. An unavailable
scanner, missing path, or mismatch blocks the write. Do not retarget to the new
ID. Existing approved-write receipts retain their fixed path/hash recovery checks;
pending repair and migrated orphan-ID guards remain in force. Ordinary proposals
whose IDs have no duplicate-repair record retain existing behavior.

Restore saved conflict-Merge text even when its recorded Concept ID or incoming
fingerprint differs from the reopened session. Display a review warning instead
of clearing the draft and replacing learner edits with generated defaults. The
current session determines the selected Concepts; existing preview/confirmation
and identity/content checks still govern any Markdown write.

This adds no persisted fields. Explicit target rebinding for ambiguous legacy
proposals remains future work. Regenerating Cards from their intended Concept is
supported; merely reopening an ambiguous legacy proposal does not resolve it.
