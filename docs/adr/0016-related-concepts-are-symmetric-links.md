# ADR 0016: Related Concepts are symmetric reviewed links

Status: Accepted

## Context

Mneme needs a small Concept-linking mechanism without turning Concept capture into vault-wide reconciliation or introducing a premature knowledge-graph taxonomy. First-pass AI capture deliberately receives no approved Concept names or Inbox context, so it cannot safely create durable links to existing vault knowledge. Prerequisite, contrast, application, and other typed relationships would also make editing and Guided Merge materially more complex before the core loop is stable.

## Decision

- The MVP supports exactly one Concept relationship: `Related`.
- `Related` is symmetric. If Concept A links Concept B, both Concept Markdown files contain the other Concept under `## Related Concepts`.
- The Markdown section contains clean Obsidian links only, without repeating a relation label:

  ```markdown
  ## Related Concepts

  - [[Mneme/Concepts/Concept-B|Concept B]]
  ```

- Concept Markdown is the relationship source of truth. Plugin state may index relationships, but may not become their only durable representation.
- A relationship is identified internally by the unordered pair of stable Concept IDs. Titles and paths are presentation and locator data, not relationship identity.
- Direct learner actions may add or remove a relationship without a fake AI approval step. The operation updates both Concept files transactionally, checks that neither file changed after preparation, and rolls back the first write if the second write fails.
- First-pass Concept capture does not receive the Concept library and does not create Related links. Active AI-assisted candidate discovery is a later, separate reviewed workflow; it must shortlist locally and may not send the entire vault or write links directly.
- Guided Merge rewires Related links as part of the reviewed merge transaction. The survivor receives the union of both Concepts' neighbors, the merged pair is removed as a self-link, duplicates are collapsed by stable Concept ID, and every affected neighbor is updated to point at the survivor.
- Empty `Related Concepts` sections are omitted. Unknown prose or malformed content in an existing section is preserved rather than silently discarded.

## Consequences

- Concept files stay readable and portable in ordinary Obsidian.
- Link creation, deletion, and Merge have one predictable behavior and no relation-type conflicts.
- Users can build a knowledge network manually before Mneme adds optional AI discovery.
- A future typed relationship system requires a new ADR and an explicit migration or compatibility strategy; existing Related links remain valid.

## Literal Markdown examples — 2026-09-20

Related-section discovery and link reading/removal use the same inspected Markdown
lines. Exclude leading frontmatter, fenced/indented code, HTML comments, single-line
code spans and escaped link delimiters. Fence closing requires the opening character,
sufficient length, and no trailing non-whitespace text. Headings inside examples or
comments must neither create a Related section nor terminate a real section.

Keep a same-length masked view solely for finding active link ranges. Confirm each
range is unchanged in the original, then remove matching ranges from right to left.
This preserves literal examples, inline comments and nonmatching prose even when a
real relationship on the same line is removed. A section containing examples or
comments is not empty and must remain. Adding a relation must not mistake an example
for an existing relationship. Refuse an append that would land inside an unclosed
code fence/comment; the learner must close it first. An earlier, closed Related
section can still be edited when a later section has an unclosed literal block.

`markdownLineInspector.ts` also supplies the existing Merge perspective/navigation
inspection. These changes apply to all callers of the Related helpers, including
manual relationship edits, Merge rewiring and deletion cleanup; they do not change
identity matching, persisted formats, transaction ordering or recovery protocols.
This remains scoped syntax inspection, not a complete Markdown parser. Setext and
complex container/HTML semantics, multiline code spans, multiple Related sections,
and path-resolution ambiguity require separate review and real Obsidian acceptance.

## Explicit directory paths — 2026-09-20

A directory-qualified Related target is a locator, not a filename hint. Guided
Merge first looks for an exact normalized Concept path. If a qualified target is
unknown, preserve it as unresolved; do not discard the directory and bind it to a
different Concept with the same basename. Only bare targets retain the existing
unique-basename lookup fallback. This applies to participant links and discovery
of incoming neighbors, so unresolved links cannot cause unrelated files to be
rewired or participant-looking links to be silently removed.

The shared add/remove matcher is directional: an authored bare link retains its
existing shorthand compatibility, but a qualified authored link only matches an
exact normalized target. In particular, `Archive/Beta` must not prevent adding a
separate root `Beta.md` relation, or be removed when that root Concept is unlinked
or deleted. Matching aliases and omitted `.md` extensions still work.

This closes directory-discarding matches without changing persisted formats or
transaction protocols. Bare-link ambiguity, relative paths, case collisions and
Obsidian's source-context resolution remain a separate audit; this is not a full
resolver replacement or an automatic rewrite of unresolved links.

## Consistent Merge matching — 2026-09-20

Guided Merge must use its preparation-time Concept resolver for both discovery
and add/remove matching. Identical normalized spellings match even if unresolved;
different spellings match only when both resolve to the same Concept path. The
shared Related helpers accept an optional matcher so Merge can preserve this rule
without duplicating the Markdown range editor.

For example, when both `Notes/Beta.md` and `Archive/Beta.md` exist, unresolved
`[[Beta]]` must survive removal of a resolved `[[Notes/Beta]]` participant link.
An ambiguous bare link also must not suppress an explicit relation to the
survivor or a neighbor, or an unresolved qualified link copied from the source.
Unique resolved shorthand still deduplicates and rewires normally. Original
aliases on retained unresolved links remain intact.

This is consistency within the existing Merge index, not native Wiki resolution.
The default matcher used by manual relationship edits and deletion still accepts
bare shorthand without a Concept index. Source-context adapters and guards for
those workflows remain separate work, as do root-path precedence, case collisions,
external index changes after preview and durable Merge recovery. No persisted
schema, plan fields or transaction protocol changes are introduced here.

## Source context for manual edits and deletion — 2026-09-21

Manual Related add/remove and Concept deletion use `relatedConceptResolution.ts`.
For bare links, ask `MetadataCache.getFirstLinkpathDest` with the owning Markdown
file's path. Match its canonical result to the selected Concept path; links to a
different file remain intact and do not suppress an explicit addition. If a bare
link has the target's basename but resolution is unavailable, stop and request an
explicit locator rather than guessing. Resolved canonical paths are compared
without case folding. Qualified authored links retain the earlier normalized
exact-path rule; this is not a complete relative/suffix-path resolver.

Both manual entry points and deletion preparation/recovery receive metadataCache.
Adding a root-level target would itself emit a bare link, so that generated
locator must resolve to the selected file before addition; otherwise stop.
Manual execution recomputes both sides after all snapshot reads and at each
forward atomic transform, including no-op decisions. Changed decisions invalidate
the plan. Compensation restores the original reviewed bytes using existing
content guards and does not depend on current link resolution.

Deletion retains checks for unchanged notes in the in-memory plan, re-evaluates
them before intent persistence, and applies this matcher during recovery with the
existing before/after hash contract. See ADR 0026 for recovery limits. No persistent
receipt fields are added. Legacy pending operations whose broader match would
produce different bytes stop for inspection rather than adopt a new plan.

This decision does not change Guided Merge's separate Concept-index resolver or
UI relationship discovery. Cache freshness, external changes after a check,
qualified relative/suffix paths, existing case folding for qualified locators,
and multiple Related sections need separate review and native Obsidian acceptance.
