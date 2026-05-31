# Mneme Pre-AI Acceptance Checklist

## Scope

This validates:

- Source Analysis
- Inbox proposal acceptance lifecycle
- Proposal Detail editing
- explicit Concept/Card acceptance
- readable/identifiable `Concept.md`
- parser-compatible `Card.md`
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
10. Save a small edit.
11. Click `Accept Concept`.
12. Open generated `Concept.md`.
13. Confirm `Concept.md` is readable and has minimal frontmatter.
14. Run `Mneme: Generate Pre-AI Acceptance Cards`.
15. Run `Mneme: Open Inbox`.
16. Confirm the Card proposal now appears under Card Proposals.
17. Review the card proposal.
18. Click `Accept Card`.
19. Open generated `Card.md`.
20. Confirm `Card.md` links back to `Concept.md` and remains parseable.
21. Run `Mneme: Log Concept-Source Links`.
22. Run `Mneme: Log Source Analysis State`.
23. Run `Mneme: Open Concept Library`.
24. Search for `Pre-AI Acceptance Pipeline`.
25. Open Concept from Concept Library.
26. Open Cards from Concept Library if `cardsPath` exists.
27. Open Review View and confirm Daily Review behavior is unchanged.

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
- `Accept Concept` creates readable `Concept.md`
- `Accept Card` creates parser-compatible `Card.md`
- accepted proposals move out of Active Inbox
- rejected proposals move out of Active Inbox
- Inbox Refresh removes stale proposals whose source note was deleted
- `Mneme: Resync Mneme Index` removes stale plugin index state without deleting Markdown
- concept-source link is indexed after Concept write
- Concept Library shows the Concept
- deleted `Concept.md` files disappear from Concept Library after refresh
- Review View behavior is unchanged

Fail:

- proposal bypasses approval
- initial fixture creates a Card proposal before the Concept is written
- proposal writes Markdown without an explicit `Accept Concept` or `Accept Card`
- `Concept.md` shows raw `sourceHash`, `proposalId`, `fsrsState`, `dueAt`, `stability`, `difficulty`, or raw JSON
- `Card.md` contains FSRS state
- index reconciliation deletes generated `Concept.md` or `Card.md`
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
