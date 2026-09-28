# One Card Group per Concept

Mneme writes one Card Group Markdown file per Concept, with every Card stored as a separately identified block and scheduled independently. This keeps the vault Concept-centered and avoids one-file-per-Card growth; legacy one-card files remain readable and may be consolidated through an explicit migration, but new accepted Card proposals append to the Concept's Card Group.

## Consequences

The Concept points to a Card Group file rather than a folder. Card edit, deletion, merge, identity repair, and FSRS state continue to operate on immutable Card IDs, while Markdown writes must append or modify an individual block without replacing unrelated Cards.

## Review grouping within shared folders — 2026-09-27

A folder is a locator, not proof that all its Cards belong to one Concept.
Review partitions files within a folder by their explicit Concept ID, falling
back to the resolved Concept link when the ID is absent. Distinct owners keep
their own title, learning mode, retention target, and Cards. Same-owner legacy
files in that folder remain one group;
link aliases that resolve to the same Concept do not split it. When some legacy
files for one stable owner omit the link, use that owner's explicit link rather
than conventional folder metadata, independent of file enumeration order. A
resolving explicit link takes precedence over stale unresolved links for that
same stable owner; if none resolves, an explicit broken link still does not
borrow conventional folder metadata.

Unassociated legacy Card files retain directory grouping. A `card_group` with no
owner gets its own file bucket and path-based fallback ID; a link-only association
uses its first Card file path as the fallback ID, so groups in separate folders
do not acquire the same ID merely by linking to one note. These are transient review
identities, not new stable IDs or persisted Markdown migrations.

Metadata lookup keeps its compatibility behavior: without an explicit Concept
link, read the conventional `Concept.md` in that folder; an explicit unresolved
link does not fall back. This change does not validate conflicting owner IDs and
links, consolidate multiple canonical Card Groups, or change cross-folder
ownership handling. Such ambiguity needs a separate review rather than an
implicit content migration.

## Cross-folder review ownership and conflicts — 2026-09-28

This extends the preceding folder-scoped rule: a stable Concept owner ID has
one review entry across the Vault, including legacy Card files in different
folders. Files are sorted by path before grouping so the representative Card
path and folder do not depend on enumeration order. This is a read-only review
aggregation; it neither consolidates Markdown nor changes the one canonical
Card Group writing model, Card IDs, or persisted review history.

Collect all resolved explicit Concept destinations for a stable owner. A single
destination takes precedence over conventional folder metadata; unresolved
explicit links retain their existing compatibility behavior. If any explicit
link is declared, do not borrow conventional `Concept.md` metadata. Without
explicit links, collect conventional candidates from all represented folders.
Multiple distinct candidate paths block that owner rather than selecting the
first file. A chosen Concept declaring a different stable Concept ID also blocks
the owner. Legacy Concept notes without a declared ID remain readable.

Ownership comes from the Card content snapshot using Obsidian's YAML parser,
and the chosen Concept is freshly read with `vault.read`. Bare Concept links use
Obsidian's source-context resolver, including when a same-named root file exists.
Read/parse failures and non-mapping YAML produce diagnostics and block affected
Cards. Conflicts retain every Card's content and ID, mark the loaded Cards invalid,
and exclude them from review. Unrelated owners remain available; a later scan
clears the transient diagnostics after the Markdown is repaired.

The Library joins these diagnostics by owner ID or its declared Card file path,
so an ID mismatch cannot turn an existing blocked group into an apparent empty
Concept. It displays `Review unavailable` with the reason and guards the action
handler against review or generation. No diagnostic state is persisted.

This does not audit unreferenced duplicate Concept IDs, refresh ownership before
rating an already-open review session, or remove metadata-cache dependence from
discovery of custom-named Card files. Link resolution still uses Obsidian's cache,
and reads are snapshots rather than a Vault-wide transaction. Those boundaries
require separate review and native acceptance testing.

## Rating an open session after Markdown edits — 2026-09-28

Before Review View submits a rating, it performs a fresh Concept/Card scan.
The displayed Card ID must occur exactly once, remain valid with an explicit
stable ID, and belong to the same unambiguous Concept. Its path, Front, Back,
Rubric, and Card Type must match what the session loaded. The Concept path,
learning mode, and retention target must also match. Differences or scan failures
leave the rating unwritten and the position unchanged, with a message directing
the learner to refresh and review again. Unrelated Card edits do not invalidate
the displayed Card solely because the surrounding file bytes changed.

The existing action lock spans both scan and persistence. Closing, resetting,
or replacing the selected Card/Concept during the scan cancels the old action
before it can call the review store. An unchanged manual Concept session may
still review exploratory Concepts; this check does not impose scheduled queue
eligibility on manual review. There are no new persisted fields or Markdown writes.

This supersedes the preceding open-session boundary only for the pre-submission
snapshot. The scan is read-only and does not refresh the visible question behind
the learner's back. It currently reads all discovered Card files for duplicate
and ownership checks on each rating; large-Vault latency needs native measurement.
Filesystem edits after the reads, metadata-cache omissions during discovery,
and changes while waiting for the review store's mutation queue remain outside
this snapshot guarantee. Ratings whose persistence has already begun retain the
existing behavior: closing the View prevents stale UI updates, not the state write.
