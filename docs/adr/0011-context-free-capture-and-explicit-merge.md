# Context-free Concept capture and explicit Merge

Source Note analysis is a context-free extraction step. `Analyze Current Note` sends only the current Source Note content, source identity, chunk metadata, language contract, and formatting contract to the provider. It does not send approved Concepts, Inbox proposals, existing Concept names, existing Concept summaries, existing tags, or vault/inbox duplicate context.

This keeps AI capture focused on “what durable Concepts are present in this note?” rather than “how should this vault be reorganized?” Duplicate or overlapping Concept proposals are allowed in Inbox. The user may reject them, accept them as separate Concepts, or later run a dedicated Merge flow.

Concept capture may produce only `new_concept` proposals. It must not produce link, update, add-view, merge, or Card proposals. Those operations require their own reviewed workflows because they modify already-approved knowledge.

Capture remains context-free, but the final write may inspect the local vault for an exact naming or identity collision. Before either a manual Concept or an accepted AI proposal is written, an exact collision presents three explicit choices:

- `Merge` safely writes the incoming Concept under a temporary deterministic sibling identity, then opens the dedicated Guided Merge workspace with both Concepts preselected. Nothing is merged until the student reviews and confirms the normal zero-write preview.
- `Refine Name` returns to Title editing. Changing Title invalidates the previous English Name so the bilingual naming pair must be reviewed again.
- `Keep Both` writes a separate Concept with a deterministic suffix.

Similar-but-not-exact Concepts remain Possible Duplicates and never block the write. The collision check is local and happens after generation, so approved Concept names and contents are still not sent during Source Note analysis.

`Keep Both` and the safe staging write used by `Merge` resolve filesystem and identity conflicts with a deterministic suffix:

```text
ConceptA.md
ConceptA-2.md
ConceptA-3.md
```

The suffix is applied consistently to primary Title, Display Title, Markdown path, `mneme_id`, and Card Group locator. Canonical English Name remains unsuffixed. The suffixed file receives a matching unique `mneme_id` and Card Group link, such as `concept-concepta-2` and `Mneme/Cards/ConceptA-2/Cards.md`. This is not itself a merge decision; it preserves Obsidian’s no-overwrite rule and Mneme’s stable identity invariant.

Merge is a separate user-triggered workspace from Concept Library and the command palette. Mneme may surface possible Merge candidates by local title/content similarity, but the student chooses the Concepts and survivor. Optional AI shortlist inspection receives only compact fields for the local shortlist. AI may draft Title, English Name, Core Meaning, and Why It Matters only after the two full Concepts are explicitly selected. The result is edited and confirmed inside the Merge workspace, not inserted into the ordinary Inbox; source Concepts are redirected only after the zero-write impact preview is acknowledged and confirmed.

Cards are force-migrated into the surviving Card Group during an accepted Merge while preserving each original Card block, immutable `cardId`, and FSRS state. Migrated Cards keep their original source stem/identity rather than being renamed to the survivor’s title. For example:

```text
conceptA-1
  conceptA-1-definition
  conceptA-1-proof
conceptA-2
  conceptA-2-definition
  conceptA-2-proof
```

becomes:

```text
conceptA
  conceptA-1-definition
  conceptA-1-proof
  conceptA-2-definition
  conceptA-2-proof
```

This avoids FSRS instability and makes Card provenance understandable after Merge.
