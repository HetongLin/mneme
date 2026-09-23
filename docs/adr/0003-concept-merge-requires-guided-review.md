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


## Pending authoring writes — 2026-09-19

A successful Markdown write may still belong to an unfinished creation or Inbox
operation until its completion state is saved. Before returning a Guided Merge
preview, check pending Manual Concept, Manual Card, and Inbox write receipts
against both participant IDs, their declared Card Group paths, and every planned
write path, including Related neighbors. A matching receipt must be completed
before Merge can alter its path, content hash or Card owner. This also protects a
reserved Card Group that does not yet exist. Compare normalized Vault paths.

Completed receipts and unrelated valid pending receipts do not block Merge.
Unreadable pending records cannot safely establish ownership and block preparation
instead of being discarded. Existing actionable-proposal checks remain in force.
If a new receipt appears after preview, the state snapshot check inside the shared
mutation queue rejects execution. These guards preserve existing authoring recovery;
they do not add a Merge journal or recover historical partial merges.

## Card Group content retention — 2026-09-20

When both participants have Card Groups, move complete source Card blocks using
exact ranges from the inspected Markdown. Build the former-group redirect from
the original file with only those blocks removed; retain its non-Card body and
custom frontmatter instead of replacing the file with a generated template.
Update Mneme type, owner, Concept link and Card redirect metadata and append the
navigation notice. Non-Card notes stay at their original path. Card blocks remain
byte-for-byte intact in the destination, and their IDs and review state do not
change. An adopted source group continues to retain its full content in place.

Require unique Card IDs within each group as well as across both groups. Refuse
mixed legacy section markers outside complete Card blocks: retaining those markers
in a vacated group could make the current parser discover an unintended Card.
This conservative check also blocks marker examples in code fences until reviewed.
No persisted schema or transaction/recovery protocol changes are introduced.

## Card relocation references — 2026-09-20

Review renders Card Markdown using its current Card Group path. Keeping the raw
block unchanged does not preserve relative attachments, same-document anchors or
document-level reference definitions when the block moves to another file.
Before preview, conservatively reject moved Cards containing local Markdown
links/images, reference links/definitions, footnotes, shortcut labels defined in
either group, or HTML resource attributes (`href`, `src`, `srcset`). Report the
Card ID and both paths so the learner can review the references. Common explicit
external Markdown destinations (`http://`, `https://`, `mailto:`, `tel:`, `data:`)
remain allowed; other schemes require manual review.

For Wiki links and embeds, compare Obsidian's resolved file path from the source
and destination contexts. Permit only a resolved, identical target other than the
source group. Refuse current-document heading/block anchors and unresolved links.
Check again immediately before the Markdown transaction, since another Vault file
can change Wiki resolution without changing the participant snapshots or data.json.
An unavailable resolver blocks Wiki relocation. Adopting a group in place needs no
relocation check. Card bytes, IDs, review state and persisted schemas stay unchanged.

This is conservative syntax inspection, including code examples, not a complete
Markdown parser or a link-rewriting migration. It does not validate external URLs,
arbitrary plugin embeds/queries, incoming backlinks, or every heading/block-ID
collision. Obsidian metadata resolution is a current cache observation, not an
atomic lock against external edits during the multi-file transaction. Real Vault
rendering acceptance and durable Merge recovery remain separate work.

## Preserved Concept perspective references — 2026-09-20

The same relocation checks apply to the merged Concept body preserved under Views.
Extract the perspective after deterministic Related-link removal, then check its
references against the source Concept and the generated survivor Markdown. Before
execution, repeat with the final edited survivor text: newly added definitions can
turn formerly literal shortcut labels into links even without a Vault file change.
The in-memory plan records whether preservation was requested; no persistent schema
or write protocol changes are introduced. An explicit service request that omits
the perspective does not relocate or validate that body. The ordinary Merge View
continues to request preservation.

Do not copy the template's `Cards: [[...]]` navigation line directly under
`## Review Cards` when its target exactly matches the source's declared Card Group.
Card association/navigation belongs to the surviving Concept, and the declared
group may not yet exist. Keep authored notes in that section and links elsewhere;
those still receive the normal reference check. Fenced examples are not treated as
managed navigation. The perspective extractor tracks fence character and opening
length, accepting only a matching, sufficiently long closing run without trailing
text, so nested examples keep their text and headings.

The shared Markdown guard retains the conservative behavior and limitations above,
including blocking reference definitions/footnotes even when some could be moved
safely. This pass does not replace the other section parsers, preserve arbitrary
Concept YAML in redirect notes, rewrite links, or provide durable Merge recovery.

## Concept body structure and adopted Card navigation — 2026-09-20

Share the Merge-specific body inspection between perspective extraction and managed
Card navigation updates. Only a level-one ATX heading on the first nonblank body
line is treated as the document title and omitted from the copied perspective.
Other headings are authored content. If any retained heading is level one, shift
all retained ATX headings by three levels; otherwise keep the existing two-level
shift. This nests them below the generated level-three View and preserves their
relative levels up to Markdown's level-six limit. Preambles and subsequent H1
headings are not silently discarded. These heading/navigation transforms leave
fenced text and HTML comments intact; existing Related-section parsing is separate.

When the survivor adopts another Card Group, update both its frontmatter locator
and matching template navigation directly under `## Review Cards`. Rewrite only
the old declared target, retaining its display alias, surrounding whitespace and
line endings. Links in prose, other sections, subsections, code examples, comments,
and links to other targets or anchors remain authored content. Do not invent a
navigation section when none exists. The same matcher removes the source template
navigation from the historical perspective.

These transformations are in `conceptMergeMarkdown.ts`. They do not change Card
bytes, IDs, FSRS state, schemas, the write transaction, or other section parsers.
This is a scoped ATX/fence/comment inspector, not a complete Markdown parser;
Setext headings, complex containers/HTML and deeper heading nesting retain their
existing limitations. Native Obsidian rendering still requires manual acceptance.

## Concept redirect content retention — 2026-09-22

Build a Concept redirect from the original Markdown instead of replacing it with
a template. Retain custom frontmatter, comments, aliases, nested/list/block values
and the original body at its original path. Keep its original line endings. This
historical copy is retained whether or not a perspective is also copied into the
survivor's Views. Existing View relocation checks still govern that separate copy.

Change the Mneme type to `concept_redirect`, retire `mneme_id` as `former_mneme_id`,
and write version/merge destination/time metadata. Put the merge notice before
the retained body so an unclosed example or comment cannot hide it. The original
body is historical content; its Card navigation and other properties are not
active Concept associations. The scanner excludes the redirect by type and the
content-free Merge Record continues to reserve the old ID. Source metadata is not
merged into or used to overwrite survivor metadata.

Do not silently overwrite pre-existing redirect metadata on an active Concept.
Such collisions, duplicate managed keys and unsupported multiline managed scalars
block preparation. Unrelated complex YAML stays untouched; this is targeted scalar
editing, not a new general YAML parser. Existing reviewed snapshots and atomic
write/compensation guards protect the retained content. No persisted plugin-data
schema or durable Merge recovery protocol is added.


## Durable Guided Merge recovery — 2026-09-24

[ADR 0031](0031-guided-merge-resumes-reviewed-file-writes.md) supersedes the earlier
in-memory compensation behavior for confirmed Guided Merge. Keep preview
zero-write; persist verified recovery snapshots outside `data.json`, record a
content-free intent, and resume only the remaining exact reviewed file writes.
State migration uses current data, and a written receipt prevents replay. Conflicts
preserve current files and snapshots for inspection; there is no automatic rollback.
