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
- review log persistence
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

## Allowed Adaptation

Mneme may:

- serialize and deserialize `ts-fsrs` Card state
- map Mneme ratings to `ts-fsrs` `Rating`
- map `ts-fsrs` `result.card` to `CardReviewState`
- show retrievability in diagnostics
- group due and new Cards by Concept
- rank Concept groups that contain eligible review Cards
- persist settings used to configure `ts-fsrs`

## Daily Review Contract

Daily Review includes:

- new Cards with no review state
- reviewed Cards with `dueAt <= now`

Daily Review excludes:

- reviewed FSRS Cards with `dueAt > now`
- Cards promoted only by nonzero retrievability risk
- invalid parsed Cards

## Future Non-Daily Modes

These modes may intentionally bypass `dueAt` later:

- Cram Mode
- Exam Mode
- Random Concept Draw
- Concept Activation

Daily Review must not bypass `dueAt`.
