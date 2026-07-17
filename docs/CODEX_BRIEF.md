# Codex Brief

## Purpose

This document is the concise engineering brief for Mneme. Read it with `AGENTS.md`, `CONTEXT.md`, and the current product specifications. ADRs in `docs/adr/` are authoritative when documents conflict.

Mneme is an Obsidian-native, AI-assisted learning layer for university students. It is Concept-centered, Markdown-first, and intentionally lower pressure than a review-debt system.

## Product Loop

AI-assisted capture:

```text
Source Note
-> AI proposes Concept changes
-> Student reviews / edits / accepts / rejects
-> Accepted knowledge is written as clean Concept Markdown
-> AI proposes Cards grounded in that approved Concept
-> Student reviews / edits / accepts / rejects
-> Accepted Cards append to the Concept's Card Group
-> Optional FSRS schedules each Card independently
-> When enabled, Mneme presents Concept-level learning state and Today’s Focus
```

Direct authorship is also first class:

```text
Student creates Concept
-> Clean approved Concept Markdown is written immediately
-> Cards may be proposed later through the same Card Review Gate
```

The Review Gate protects AI-proposed knowledge changes. It must not impersonate approval for content the student authored directly.

## Stable Product Principles

1. AI proposes; the student decides what enters the vault.
2. A student-authored Concept is already approved knowledge and needs no fake proposal.
3. Concept is the primary learning object; Card is an assessment instrument.
4. Concept Markdown and Card Group Markdown are the content source of truth.
5. `data.json` stores state, indexes, hashes, proposals, FSRS state, logs, and caches—not Card front/back content.
6. Scheduled Review is optional. When enabled, FSRS fully controls Today’s Focus eligibility and Concept aggregation cannot reschedule or cap eligible Cards. When hidden, Mneme preserves scheduled-review state and history, while manual Concept Review from Concept Library still records FSRS ratings.
7. Concept Learning State distinguishes memory risk, assessment coverage, and explicit student signals; it is not a mastery percentage.
8. Inbox is a review queue, not a debug dashboard. List items can Open or Reject; acceptance happens only inside the complete editable Review Gate.
9. Fixed product labels are English. Generated learning prose follows the Source Note's detected dominant language. Chinese learning content includes standard English names for technical concepts on first occurrence.
10. AI should propose stable English tag slugs, but user-approved tags in other scripts remain valid.
11. Concept capture has no fixed proposal-count cap, but every proposal must represent a durable knowledge change, use a canonical context-independent Concept title, prefer updating or linking existing knowledge over duplication, and carry verified Source Note evidence.
12. Long Source Notes are analyzed completely through Markdown-aware chunks with visible coverage; no provider request may silently stand in for an unprocessed remainder.
13. Review should feel like Today’s Focus, not accumulated debt. Non-due FSRS Cards remain Later and cannot be promoted by ranking. Every due or new eligible Card remains accessible; Mneme does not impose daily Concept, daily Card, or per-Concept Card caps.
14. Never silently discard or destructively migrate user Markdown.

## Markdown Model

Each approved Concept is one clean `Concept.md`-style Markdown note with minimal Mneme frontmatter. Empty template sections are omitted.

Each Concept has one canonical Card Group Markdown file, normally:

```text
Mneme/Cards/<Concept>/Cards.md
```

Every Card is a separately marked block with its own immutable ID, optional assessment type, and independent FSRS state. Legacy one-Card files remain readable; consolidation must be explicit and lossless.

The Concept's declared `cards` link is the location authority for future Card writes. A title edit must not create a second Card Group.

## Card Generation

Cards can be generated only from a written, reviewable Concept—not from a Source Note or a Mneme Concept passed through `Analyze Current Note`.

Duplicate protection uses a Learning Content Fingerprint derived from assessable Concept sections. After a successful generation call, accepting or rejecting its proposals does not unlock another round for the same fingerprint. Metadata-only changes such as tags, paths, provenance, or navigation links also do not unlock another generation round; assessable learning content must change.

Existing accepted Card fronts are passed to the provider as a Coverage Map. The provider should add missing assessment outcomes or perspectives rather than paraphrasing existing Cards. A fully rejected round may be retried because it wrote no Card content.

## Review UX

When FSRS scheduling is enabled, the main review flow is deliberately narrow:

1. Show Front.
2. `Show Answer` reveals Back.
3. Show `Again / Hard / Good / Easy` on one row.
4. A rating updates only that Card's FSRS state and advances.

`More` contains Edit, Open Concept, Skip, Review Later, Suspend, Retire, and Delete. Rubric and technical details remain under `Card details` by default. Rubric may guide self-assessment but must not introduce knowledge absent from Back.

When Scheduled Review is disabled, Review View explains that Today’s Focus is hidden and exposes no scheduled-review queue or rating controls. Manual Concept Review remains available from Concept Library and updates Card memory. Re-enabling Today’s Focus resumes from the real FSRS history; it does not reset or shift due dates.

## Scope Boundaries

Do not expand ordinary stabilization work into Exam Mode, a built-in project recommender, Anki synchronization, automatic vault scanning, or a complex autonomous agent loop.

Anki integration is export-only: exported cards are independent copies. Use Mode should prefer exporting approved Concept context for another agent or chatbot.

## Engineering Rules

- Use TypeScript and Obsidian Plugin API conventions.
- Keep orchestration thin in `main.ts`; put domain logic in focused services.
- Preserve existing persisted formats or provide explicit compatibility reads.
- Use stable Concept and Card IDs for durable state; paths and titles are mutable locators.
- Validate AI output and malformed Markdown without crashing.
- Make writes idempotent where retries are possible.
- Keep migrations explicit, previewable, and rollback-safe.
- Update product docs or add an ADR when an implementation changes a domain invariant.

## Verification

For code changes, run at least:

```bash
npm run build
npm run test:all
```

Then report the commit, changed behavior, verification results, and focused manual Obsidian checks. Preserve the long-standing untracked `mneme` item unless the user explicitly says otherwise.

## Local References

When an API detail is uncertain, inspect:

- `../../references/obsidian/obsidian-sample-plugin`
- `../../references/obsidian/obsidian-api`
- `../../references/libraries/ts-fsrs`

External engineering skill repositories under `../../coding-skills/` are read-only references, not Mneme source code.
