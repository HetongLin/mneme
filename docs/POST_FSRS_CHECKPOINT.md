# Post-FSRS Integration Checkpoint

This checkpoint records Mneme's review architecture after adding the FSRS scheduler adapter and correcting Daily Review to be due-card driven.

## Current FSRS Flow

```text
Card.md
-> stable cardId
-> Flashcard rating
-> FsrsReviewScheduler
-> CardReviewState with scheduler: fsrs
-> dueAt-driven Daily Review eligibility
-> ConceptMemoryAggregator
-> ConceptQueueRanker
-> Concept Review Queue
```

## Architecture Principle

FSRS is card-level.

Concepts are user-facing learning units. Review actions are recorded per stable `cardId`, and concept priority ranks groups of Daily Review-eligible Cards. FSRS does not schedule Concepts directly.

FSRS `dueAt` is the authority for Daily Review eligibility. Retrievability is diagnostic and may later become a secondary signal among eligible Cards, but it must not promote non-due Cards into Daily Review.

See also: [FSRS Integration Contract](FSRS_INTEGRATION_CONTRACT.md).

## Manual Validation Protocol

1. Run `Mneme: Clear Review History`.
2. Create a concept with two cards using explicit cardIds.
3. Refresh Mneme Review View.
4. Review the first card with `Good`.
5. Run `Mneme: Log Review State`.
6. Confirm the reviewed card state includes:
   - `scheduler: "fsrs"`
   - `fsrsState`
   - `stability`
   - `difficulty`
   - `dueAt`
   - `reviewCount`
7. Refresh Cards.
8. Expand Advanced Diagnostics.
9. Confirm the reviewed card shows:
   - `riskSource: fsrs`
   - `retrievability`
   - `risk`
   - `includedInDailyReview: false` if FSRS scheduled it into the future
   - `eligibilityReason: not-due`
10. Confirm the unreviewed card still shows:
   - `riskSource: placeholder`
   - no FSRS retrievability
11. Review another card with `Again`.
12. Confirm state updates and the app does not crash.
13. Confirm `Mneme: Clear Review History` removes FSRS states.
14. Confirm Flash Card mode remains clean and card-focused.

## Expected Behavior

- New cards enter Daily Review.
- Reviewed FSRS cards enter Daily Review only when `dueAt <= now`.
- Reviewed FSRS cards scheduled in the future remain out of the main queue even when retrievability risk is non-zero.
- FSRS scheduling settings affect future reviews only.
- FSRS details live in diagnostics.
- The main queue remains concept-centered.

## Known Limitations

- No retention settings UI.
- No FSRS parameter optimization.
- No review log export/import.
- No schema migration UI.
- Existing placeholder states are not converted to FSRS.
- Concept group priority formula is still MVP weighting over eligible Daily Review Cards.
- No source-note-level navigation yet.

## Next Recommended Tasks

1. Task 017: FSRS Retention Settings
2. Task 018: Review Log / Revlog Foundation
3. Task 019: Concept Importance and Exam Mode
4. Task 020: Source Navigation Enhancement
