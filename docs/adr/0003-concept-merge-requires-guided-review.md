# Concept merge requires guided review

## Decision

Concept Merge is an explicit, user-confirmed workflow in a dedicated `Merge Concepts` workspace. It is never run automatically during Source Note analysis, Concept acceptance, duplicate detection, or ordinary Inbox review. The workspace is always available from the Concept Library header and command palette; Possible Duplicates may preselect a pair but remain diagnostic only. An exact collision discovered at the final write gate may offer `Merge`, but that choice only stages the incoming Concept under a safe sibling identity and opens this same workspace with the pair preselected. The learner must still review and confirm the normal merge preview.

The learner selects Concept A and Concept B and chooses which stable identity survives. Manual selection and a Manual Draft work without AI. Local similarity may rank up to eight candidates. Optional AI inspection receives only the selected Concept and that shortlist's title, optional English Alias, Core Meaning, and Why It Matters, and may classify each pair as likely duplicate, overlapping but distinct, related, or uncertain. It cannot choose or execute a Merge.

The single-column editor exposes Title, Core Meaning, Why It Matters, and English Alias only when enabled, with the original Concepts available under a collapsed comparison. A Manual Draft combines the two learning sections. An optional AI Draft receives the full Markdown of only the two explicitly selected Concepts and returns only those enabled editable content fields. Identity, Cards, Source Notes, Related Concepts, tags, importance, learning mode, paths, and FSRS state remain deterministic code decisions.

Before any write, Mneme builds a zero-write preview in a compact confirmation dialog. The summary reports preserved Cards, Source Notes, rewired Related links, the surviving identity, and Redirect Notes; full Markdown changes remain collapsed under Advanced. Cancel or closing the dialog returns to editing, while the dialog's explicit `Confirm Merge` action writes. If any involved Markdown or plugin data changed after preview, execution aborts. If a write or persistence step fails, Mneme rolls back every completed Markdown write and restores plugin data.

## Deterministic merge rules

- The chosen survivor keeps its `mneme_id` and path.
- Tags are unioned and deduplicated; the stronger importance wins; learning mode is `reviewable` when either input is reviewable.
- Source relationships and evidence are unioned and deduplicated.
- The survivor receives the union of Related neighbors. A↔B self-links disappear, neighbor links are rewired to the survivor, and duplicates collapse.
- Complete Card blocks are force-migrated into the surviving Card Group. Their immutable Card IDs, source stems, Markdown, Card-keyed controls, review events, and FSRS state are never rewritten.
- If the survivor has no Card Group, it adopts the other group. A vacated group becomes a Card Group Redirect.
- The merged-away Concept becomes a non-Concept Redirect Note, and a permanent content-free Concept Merge Record reserves the old ID.
- Actionable Inbox proposals, malformed or duplicate Card IDs, shared Card Groups, unsupported legacy Card folders, and ambiguous identity block the Merge.

## Consequences

AI accelerates comparison and prose drafting but cannot reorganize approved knowledge without the learner's reviewed confirmation. The workflow is deliberately more explicit than ordinary editing because it changes identity and graph structure while preserving long-lived review state.

## Async selection boundaries — 2026-09-10

Ordinary Guided Merge tracks an operation revision. Refreshing, selecting another
pair, restarting a manual draft or closing the workspace invalidates results from
earlier scans, AI drafts, shortlist inspections and confirmations. The same pair
being reopened is a new activation. Capture the survivor before asynchronous AI
work, and pass the confirmed plan and final Markdown directly to execution rather
than retaining mutable preview fields on the View.

Keep editing and selection locked from preview preparation through confirmation
and commit. Disabled controls also reject stale callbacks. A refresh or selection
requested through another entry point can replace uncommitted work; it must wait
for an already-started commit. Closing immediately invalidates UI work and waits
for that commit without undoing it. Completion still refreshes dependent views,
but cannot redraw a closed workspace. Successful execution clears the in-memory
draft and rejects repeated submission until a new selection/refresh starts.

An ordinary scan that loses the current Concept selection preserves authored
draft text, while missing targets prevent confirmation. Explicit pair selection
and Start Manual Draft retain their existing draft-reset behavior. No persisted
fields or underlying Merge transaction rules change. These guards do not provide
cross-process recovery, external-writer isolation, or real Obsidian window/restart
acceptance. Name-conflict Merge uses its separate workflow in ADR 0021.


## Current Card association — 2026-09-19

Before preparing Card migration, compare each selected Concept's current
frontmatter Card Group locator with the locator in its scanned summary. A
changed, removed, or newly added association requires refreshing the Concept
Library and rebuilding the selection/preview. Do not move Cards from a cached
path or restore an obsolete link merely because the Concept ID still matches.
Use the same path interpretation as the scanner, including link aliases and an
omitted `.md` extension. Ambiguous or unsupported scalar fields block preparation.
Existing post-preview snapshot checks continue to protect execution.

Merge and ID repair share the conservative scalar reader for leading frontmatter:
plain/quoted scalar values, comments and LF/CRLF are supported; duplicate fields
are not treated as valid identities. This does not add a full YAML parser,
change persisted formats, or provide durable transaction recovery.
