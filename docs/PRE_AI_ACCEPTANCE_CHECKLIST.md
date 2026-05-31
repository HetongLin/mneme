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
5. Open the concept proposal.
6. Confirm payload is readable and editable.
7. Save a small JSON edit.
8. Approve the concept proposal.
9. Click `Write Markdown`.
10. Open generated `Concept.md`.
11. Confirm `Concept.md` is readable and has minimal frontmatter.
12. Open the card proposal.
13. Approve the card proposal.
14. Click `Write Markdown`.
15. Open generated `Card.md`.
16. Confirm `Card.md` links back to `Concept.md` and remains parseable.
17. Run `Mneme: Log Concept-Source Links`.
18. Run `Mneme: Log Source Analysis State`.
19. Run `Mneme: Open Concept Library`.
20. Search for `Pre-AI Acceptance Pipeline`.
21. Open Concept from Concept Library.
22. Open Cards from Concept Library if `cardsPath` exists.
23. Open Review View and confirm Daily Review behavior is unchanged.

## Pass Criteria

Pass:

- fixture source note exists
- proposals appear in Inbox
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
