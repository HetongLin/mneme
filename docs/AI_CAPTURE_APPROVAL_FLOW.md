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

## AI Does Not Write Permanent Markdown

AI output is proposal data until approved.

Suggested Concepts and Cards do not become `Concept.md` or `Card.md` content until a user approves them.

## No Accept All As Primary UX

Bulk operations may exist later, but the default UX should encourage reading, editing, and review.

Inbox is a long-term knowledge-change approval layer, not a one-time generation queue.
