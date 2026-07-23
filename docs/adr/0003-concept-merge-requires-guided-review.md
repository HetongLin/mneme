# Concept merge requires guided review

## Decision

Concept Merge is an explicit, user-confirmed workflow in a dedicated `Merge Concepts` workspace. It is never run automatically during Source Note analysis, Concept acceptance, duplicate detection, or ordinary Inbox review. The workspace is always available from the Concept Library header and command palette; Possible Duplicates may preselect a pair but remain diagnostic only. An exact collision discovered at the final write gate may offer `Merge`, but that choice only stages the incoming Concept under a safe sibling identity and opens this same workspace with the pair preselected. The student must still review and confirm the normal merge preview.

The student selects Concept A and Concept B and chooses which stable identity survives. Manual selection and a Manual Draft work without AI. Local similarity may rank up to eight candidates. Optional AI inspection receives only the selected Concept and that shortlist's title, English Name, Core Meaning, and Why It Matters, and may classify each pair as likely duplicate, overlapping but distinct, related, or uncertain. It cannot choose or execute a Merge.

The single-column editor exposes only Title, English Name, Core Meaning, and Why It Matters, with the original Concepts available under a collapsed comparison. A Manual Draft combines the two learning sections. An optional AI Draft receives the full Markdown of only the two explicitly selected Concepts and returns only those four editable content fields. Identity, Cards, Source Notes, Related Concepts, tags, importance, learning mode, paths, and FSRS state remain deterministic code decisions.

Before any write, Mneme builds a zero-write preview. The compact summary reports preserved Cards, Source Notes, rewired Related links, the surviving identity, and Redirect Notes; full Markdown changes remain under Advanced. The student must explicitly acknowledge the preview and confirm. If any involved Markdown or plugin data changed after preview, execution aborts. If a write or persistence step fails, Mneme rolls back every completed Markdown write and restores plugin data.

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

AI accelerates comparison and prose drafting but cannot reorganize approved knowledge without the student's reviewed confirmation. The workflow is deliberately more explicit than ordinary editing because it changes identity and graph structure while preserving long-lived review state.
