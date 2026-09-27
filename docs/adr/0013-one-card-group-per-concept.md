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
