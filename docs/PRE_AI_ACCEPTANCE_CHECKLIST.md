# Mneme Pre-AI Acceptance Checklist

## Scope

This validates:

- Source Analysis
- Inbox proposal acceptance lifecycle
- Proposal Detail editing
- explicit Concept/Card acceptance
- readable/identifiable `Concept.md`
- parser-compatible Card Group Markdown
- ConceptSourceLink indexing
- Concept Library scanning
- Review/FSRS regression

This does not validate:

- AI concept extraction quality
- AI card generation quality
- duplicate detection by AI
- API key handling
- real model/token behavior

## Setup

1. Reload/enable Mneme.
2. Confirm Git is clean except the known untracked `mneme` symlink.
3. Open Mneme settings and enable Developer Tools.
4. Reload Mneme if command palette visibility does not update immediately.
5. Run test commands if desired.

## Acceptance Flow

1. Run `Mneme: Create Pre-AI Acceptance Fixture`.
2. Open the generated source note.
3. Run `Mneme: Analyze Current Note`.
4. Run `Mneme: Open Inbox`.
5. Confirm only the Concept proposal appears initially.
6. Confirm Inbox summary uses `To Review`, `Concept Proposals`, `Card Proposals`, and `Invalid`.
7. Confirm lifecycle counters such as approved, rejected, stale, and written are not primary Inbox UI.
8. Review the concept proposal.
9. Confirm payload is readable and editable.
10. Make a small edit without looking for a separate save action.
11. Click `Accept & Next` and confirm the edit is auto-saved into the accepted Concept.
12. Open generated `Concept.md`.
13. Confirm `Concept.md` is readable and has minimal frontmatter.
14. Run `Mneme: Generate Pre-AI Acceptance Cards`.
15. Run `Mneme: Open Inbox`.
16. Confirm the Card proposal now appears under Card Proposals.
17. Review the card proposal.
18. Click `Accept & Next`.
19. Open generated `Cards.md`.
20. Confirm the Card Group links back to `Concept.md` and remains parseable.
21. Run `Mneme: Log Concept-Source Links`.
22. Run `Mneme: Log Source Analysis State`.
23. Run `Mneme: Open Concept Library`.
24. Search for `Pre-AI Acceptance Pipeline`.
25. Open Concept from Concept Library.
26. Open Cards from Concept Library if `cardsPath` exists.
27. Open Review View and confirm Daily Review behavior is unchanged.

## Concept Retention Policy

1. In Concept Library, open `More` → `Edit Concept` for a reviewable Concept.
2. Confirm blank `Retention Target` identifies the current global value through its placeholder.
3. Enter `0.94`, save, and confirm `retention_target: 0.94` appears in Concept frontmatter.
4. Open Review and confirm Details reports `Retention Target: 0.94 (Concept override)`.
5. Rate one Card and confirm the normal FSRS review advances once.
6. Reopen Edit Concept, clear Retention Target, and save.
7. Confirm the frontmatter field is removed and Review Details reports the global target.
8. Confirm changing Importance never adds or changes `retention_target` and changing Retention Target does not immediately change an existing Card due date.

## Card Edit Conflict Safety

1. Open a Card in Edit Card and leave the editor open.
2. Change that Card's Back directly in its Card Group Markdown.
3. Return to Edit Card and save; confirm Mneme reports a conflict and preserves the direct Markdown change.
4. Reopen Edit Card, then change a different Card in the same Card Group directly.
5. Save the selected Card and confirm both edits survive.

## Pass Criteria

Pass:

- fixture source note exists
- initial fixture creates only the Concept proposal
- Card proposal can only be generated after `Concept.md` exists
- Card proposal references the written Concept
- Developer Tools hides fixture and logging commands when disabled
- Inbox main summary stays product-facing
- Concept and Card approval remain separate
- invalid JSON is rejected
- valid edited payload can be saved
- `Accept & Next` creates readable `Concept.md`
- `Accept & Next` appends parser-compatible Card Group content
- accepted proposals move out of Active Inbox
- rejected proposals move out of Active Inbox
- Inbox Refresh removes stale proposals whose source note was deleted
- `Mneme: Resync Mneme Index` removes stale plugin index state without deleting Markdown
- concept-source link is indexed after Concept write
- Concept Library shows the Concept
- deleted `Concept.md` files disappear from Concept Library after refresh
- stale approved Source links appear in Concept Library and require a reviewed Guided Relink
- Guided Relink preserves relation/evidence and does not mark the replacement as AI-captured
- Reviewed Removal deletes only the selected stale relation and preserves shared Source entries
- Review View behavior is unchanged

Fail:

- proposal bypasses approval
- initial fixture creates a Card proposal before the Concept is written
- proposal writes Markdown without an explicit Review Gate `Accept & Next`
- `Concept.md` shows raw `sourceHash`, `proposalId`, `fsrsState`, `dueAt`, `stability`, `difficulty`, or raw JSON
- Card Group Markdown contains FSRS state
- index reconciliation deletes generated `Concept.md` or Card Group Markdown
- deleted source notes leave stale proposals visible after Inbox Refresh
- deleted `Concept.md` files remain visible after Concept Library refresh
- Concept Library cannot find the generated Concept
- Review View breaks or Daily Review behavior changes

## Cleanup

The fixture creates files under:

```text
Mneme/Acceptance/
```

Mneme does not automatically delete these files. Remove them manually only when you no longer need the validation fixture.
