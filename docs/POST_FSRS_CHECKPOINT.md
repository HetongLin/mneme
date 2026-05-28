# Post-FSRS Integration Checkpoint

This checkpoint records Mneme's review architecture after adding the FSRS scheduler adapter and FSRS retrievability-based concept risk.

## Current FSRS Flow

```text
Card.md
-> stable cardId
-> Flashcard rating
-> FsrsReviewScheduler
-> CardReviewState with scheduler: fsrs
-> retrievability calculation
-> card risk = 1 - retrievability
-> ConceptMemoryAggregator
-> ConceptQueueRanker
-> Concept Review Queue
```

## Architecture Principle

FSRS is card-level.

Concepts are user-facing learning units. Review actions are recorded per stable `cardId`, and concept priority is computed by aggregating card-level memory states. FSRS does not schedule Concepts directly.

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
10. Confirm the unreviewed card still shows:
   - `riskSource: placeholder`
   - no FSRS retrievability
11. Review another card with `Again`.
12. Confirm state updates and the app does not crash.
13. Confirm `Mneme: Clear Review History` removes FSRS states.
14. Confirm Flash Card mode remains clean and card-focused.

## Expected Behavior

- New cards use placeholder risk.
- Reviewed FSRS cards use FSRS retrievability risk.
- Not-due cards should not dominate the main queue.
- FSRS details live in diagnostics.
- The main queue remains concept-centered.

## Known Limitations

- No retention settings UI.
- No FSRS parameter optimization.
- No review log export/import.
- No schema migration UI.
- Existing placeholder states are not converted to FSRS.
- Concept priority formula is still MVP weighting.
- No source-note-level navigation yet.

## Next Recommended Tasks

1. Task 017: FSRS Retention Settings
2. Task 018: Review Log / Revlog Foundation
3. Task 019: Concept Importance and Exam Mode
4. Task 020: Source Navigation Enhancement
