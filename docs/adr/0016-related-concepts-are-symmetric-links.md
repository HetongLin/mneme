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
- Direct student actions may add or remove a relationship without a fake AI approval step. The operation updates both Concept files transactionally, checks that neither file changed after preparation, and rolls back the first write if the second write fails.
- First-pass Concept capture does not receive the Concept library and does not create Related links. Active AI-assisted candidate discovery is a later, separate reviewed workflow; it must shortlist locally and may not send the entire vault or write links directly.
- Guided Merge rewires Related links as part of the reviewed merge transaction. The survivor receives the union of both Concepts' neighbors, the merged pair is removed as a self-link, duplicates are collapsed by stable Concept ID, and every affected neighbor is updated to point at the survivor.
- Empty `Related Concepts` sections are omitted. Unknown prose or malformed content in an existing section is preserved rather than silently discarded.

## Consequences

- Concept files stay readable and portable in ordinary Obsidian.
- Link creation, deletion, and Merge have one predictable behavior and no relation-type conflicts.
- Users can build a knowledge network manually before Mneme adds optional AI discovery.
- A future typed relationship system requires a new ADR and an explicit migration or compatibility strategy; existing Related links remain valid.
