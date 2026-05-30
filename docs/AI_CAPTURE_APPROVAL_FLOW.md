# AI Capture Approval Flow

The intended future flow is:

```text
Analyze Current Note
-> Check Source Hash
-> Extract Concept Candidates
-> Match Existing Concepts
-> Generate Proposals
-> Inbox Review
-> User edits / approves / rejects / merges
-> Approved Concepts write Concept.md
-> Approved Cards write Card.md
-> Written Cards enter FSRS
-> Review Mode groups due/new Cards by Concept
```

## Source-First But Concept-Centered

AI analyzes Source Notes, but the durable learning unit is Concept.

Correct:

```text
Source Note -> Concept proposals -> approved Concepts -> Card proposals -> approved Cards
```

Incorrect:

```text
Source Note -> direct Card dump
```

Cards are generated to test Concepts, not to replace Concepts.

## Hash-Based Scanning

Source Notes should be re-analyzed only when changed.

Store:

- path
- mtime
- size
- content hash

Fast path:

- if `mtime` and `size` are unchanged, skip reading content if a previous record exists

Accurate path:

- if metadata changed, read content and compute hash
- if content hash is unchanged, skip AI analysis
- if content hash changed, mark stale and generate proposals

## Runtime Foundation

`Mneme: Analyze Current Note` currently indexes source note metadata and content hash only.

It persists a `SourceAnalysisRecord` in plugin data through `SourceAnalysisStore`. This lets Mneme skip unchanged notes before any future AI call is made.

This command does not extract Concepts, generate Cards, create Inbox proposals, or write Markdown yet.

## Inbox Shell

`KnowledgeProposalStore` persists future Inbox proposals in plugin data.

The Inbox currently provides a review shell for proposal lifecycle status only. Users can open, approve, or reject stored proposals, but approved proposals do not write `Concept.md` or `Card.md` yet.

Future tasks will add proposal payload schemas, AI generation, diff preview, editing, and Markdown writing.

## Proposal Detail Review

Knowledge proposals now support typed payloads for future Concept and Card changes.

The Inbox can open a proposal detail modal with a temporary JSON payload editor. Users can save edits, approve valid payloads, or reject proposals. Approval still does not write Markdown.

`Mneme: Add Sample Knowledge Proposal` is a temporary debug command for manual Inbox validation. It creates proposal data only; it does not call AI or write files.

## AI Does Not Write Permanent Markdown

AI output is proposal data until approved.

Suggested Concepts and Cards do not become `Concept.md` or `Card.md` content until a user approves them.

## No Accept All As Primary UX

Bulk operations may exist later, but the default UX should encourage reading, editing, and review.

Inbox is a long-term knowledge-change approval layer, not a one-time generation queue.
