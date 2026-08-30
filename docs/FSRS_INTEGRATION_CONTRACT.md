# FSRS Integration Contract

This document records the boundary between Mneme and `ts-fsrs`.

## Core Principle

FSRS owns card scheduling.

Mneme owns Markdown parsing, persistence, concept grouping, diagnostics, and Obsidian UI.

## FSRS-Owned Fields

These fields must come from `ts-fsrs` scheduling results or retrievability APIs:

- `dueAt`
- `stability`
- `difficulty`
- `fsrsState`
- `scheduledDays`
- `learningSteps`
- `reviewCount` / FSRS `reps`
- `lapseCount` / FSRS `lapses`
- retrievability calculation
- review transition after `Again`, `Hard`, `Good`, or `Easy`

## Mneme-Owned Fields

Mneme owns context and persistence fields around the FSRS state:

- `cardId`
- `conceptId` / `conceptTitle`
- `conceptPath`
- `cardPath`
- source navigation metadata
- settings persistence
- review state persistence
- content-free review event persistence
- diagnostics
- concept grouping

## Forbidden Behavior

Mneme must not:

- calculate `dueAt` manually
- calculate `stability` manually
- calculate `difficulty` manually
- infer FSRS state from custom rules
- use concept risk to make non-due FSRS cards enter Daily Review
- replace `ts-fsrs` `scheduler.next` with custom scheduling logic
- use retrievability as a Daily Review trigger
- add daily Concept, daily Card, or per-Concept Card caps above FSRS eligibility

## Allowed Adaptation

Mneme may:

- serialize and deserialize `ts-fsrs` Card state
- map Mneme ratings to `ts-fsrs` `Rating`
- map `ts-fsrs` `result.card` to `CardReviewState`
- show retrievability in diagnostics
- group due and new Cards by Concept
- rank Concept groups that contain eligible review Cards
- persist settings used to configure `ts-fsrs`
- hide the scheduled review surface without disabling FSRS memory updates

## Optional Scheduling Contract

When `fsrsEnabled` is false:

- Today’s Focus contains no Cards
- Mneme Review shows no scheduled Concept queue, `Show Answer`, or rating controls
- Concept Library `Review Cards` may still start a Concept-scoped Flash Card session
- Concept-scoped manual ratings still update FSRS state, due dates, and review history
- reading, editing, and Concept Library browsing alone create no review event
- new Cards remain new until they are manually reviewed or scheduled review is shown again

When it is enabled again, Mneme uses stored due dates immediately and passes the real current review time to `ts-fsrs`. It does not reset state, shift due dates, or subtract the disabled interval. Any manual Concept Review events recorded while Today’s Focus was hidden remain part of the same FSRS history.

## FSRS Review Contract

FSRS Review includes:

- new Cards with no review state
- reviewed Cards with `dueAt <= now`

FSRS Review excludes:

- reviewed FSRS Cards with `dueAt > now`
- Cards promoted only by nonzero retrievability risk
- invalid parsed Cards
- suspended or retired Cards
- deleted Cards represented only by tombstones

Recording an FSRS rating also appends a Mneme-owned event containing only Card ID, rating, and review time. Deleting a Card clears its active FSRS state but does not rewrite past events. Event logs never drive FSRS scheduling transitions.

## Non-daily entry points

A non-daily entry point may open a Concept or start its existing manual Concept Review, but it must not record an FSRS rating outside the normal learner-confirmed review flow.

A future stateless `Rediscover a Concept` entry point may bypass `dueAt` only to browse or enter the existing manual review path. It creates no parallel learning state and does not call AI. Today’s Focus remains due-card driven.
