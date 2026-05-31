# Mneme Pre-AI Acceptance Checklist

## Scope

This validates:

- Source Analysis
- Inbox proposal lifecycle
- Proposal Detail editing
- explicit Markdown writing
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
3. Run test commands if desired.

## Acceptance Flow

1. Run `Mneme: Create Pre-AI Acceptance Fixture`.
2. Open the generated source note.
3. Run `Mneme: Analyze Current Note`.
4. Run `Mneme: Open Inbox`.
5. Confirm only the Concept proposal appears initially.
6. Open the concept proposal.
7. Confirm payload is readable and editable.
8. Save a small JSON edit.
9. Approve the concept proposal.
10. Click `Write Markdown`.
11. Open generated `Concept.md`.
12. Confirm `Concept.md` is readable and has minimal frontmatter.
13. Run `Mneme: Generate Pre-AI Acceptance Cards`.
14. Run `Mneme: Open Inbox`.
15. Confirm the Card proposal now appears under Card Proposals.
16. Open the card proposal.
17. Approve the card proposal.
18. Click `Write Markdown`.
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
- Concept and Card approval remain separate
- invalid JSON is rejected
- valid edited payload can be saved
- approval does not write Markdown automatically
- `Write Markdown` creates readable `Concept.md`
- `Write Markdown` creates parser-compatible `Card.md`
- concept-source link is indexed after Concept write
- Concept Library shows the Concept
- Review View behavior is unchanged

Fail:

- proposal bypasses approval
- initial fixture creates a Card proposal before the Concept is written
- approved proposal writes Markdown automatically without `Write Markdown`
- `Concept.md` shows raw `sourceHash`, `proposalId`, `fsrsState`, `dueAt`, `stability`, `difficulty`, or raw JSON
- `Card.md` contains FSRS state
- Concept Library cannot find the generated Concept
- Review View breaks or Daily Review behavior changes

## Cleanup

The fixture creates files under:

```text
Mneme/Acceptance/
```

Mneme does not automatically delete these files. Remove them manually only when you no longer need the validation fixture.
