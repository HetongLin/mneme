# Pre-FSRS Architecture Checkpoint

This checkpoint records the Mneme review architecture before replacing placeholder scheduling with FSRS.

## Current Completed Flow

```text
Concept.md / Card.md
-> Card marker parsing
-> CardFileLoader
-> ConceptLoader
-> stable cardId
-> ReviewStateStore
-> PlaceholderReviewScheduler
-> ReviewQueueBuilder
-> ConceptMemoryAggregator
-> ConceptQueueRanker
-> ReviewView
```

## Architecture Principle

Scheduling is card-level.

Concepts are user-facing learning units. Concept priority is computed by aggregating card-level review states. FSRS will replace the placeholder card scheduler, not the concept queue architecture.

## Review View UX Principle

Flashcard mode should stay focused on the current card: front, answer reveal, rubric, and rating actions. Diagnostic data should be progressively disclosed at concept and card level, with the completion state offering `Back to Concepts` and `Source` actions.

## Review History Reset

`Mneme: Clear Review History` clears persisted card review states from plugin data without modifying `Concept.md`, `Card.md`, or source notes. This is useful during debugging, after major card rewrites, and before FSRS migration testing.

## What Must Be True Before FSRS

- cardId is stable and explicit.
- duplicate cardId is detected.
- review state persists by cardId.
- rating updates review state.
- due/new/not-due classification works.
- concept memory aggregation works.
- concept queue ranking works.
- flashcard UI remains card-focused and minimal.
- diagnostics expose enough data for debugging.

## Manual Validation Protocol

1. Create three concepts:
   - Concept A: two valid cards with explicit IDs.
   - Concept B: one valid card with explicit ID.
   - Concept C: invalid card missing BACK.
2. Refresh Review View.
3. Confirm A/B appear in queue and C only in diagnostics.
4. Review one card as Good.
5. Refresh and confirm it becomes not-due.
6. Review one card as Again.
7. Refresh and confirm its concept priority increases or remains high.
8. Run `Mneme: Log Review State`.
9. Confirm review state persists by cardId.
10. Expand Advanced Diagnostics.
11. Confirm rank, priorityScore, cardId, dueStatus, dueAt, and reviewCount appear.
12. Confirm Flash Card UI does not show diagnostics during review.

## Known Limitations Before FSRS

- Placeholder scheduler only.
- Risk model is approximate.
- No real retrievability calculation yet.
- No FSRS parameters.
- No migration from placeholder to FSRS yet.
- No user settings for desired retention.
- No reset/edit review state UI.

## FSRS Integration Plan

1. FSRS Scheduler Adapter
2. Review State Migration
3. FSRS diagnostics
4. Concept risk uses `risk = 1 - retrievability`
5. Optional retention settings

## Task 015 FSRS Adapter Note

Task 015 wires `ts-fsrs` behind the card-level `ReviewScheduler` abstraction. Placeholder review states are not inferred as FSRS memory; cards start fresh under FSRS unless their stored state was written by the FSRS scheduler.

## Task 016 Retrievability Risk Note

Task 016 updates concept memory so FSRS-reviewed cards use `risk = 1 - retrievability`. New Cards and malformed or non-FSRS states still use placeholder risk.
