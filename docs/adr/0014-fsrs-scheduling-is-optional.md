# ADR 0014: FSRS scheduling is optional

Status: Accepted

## Context

Mneme can be useful as a Concept Library even when a student does not want scheduled Card review. The previous Today’s Focus policy also applied daily Concept, daily Card, and per-Concept Card caps after FSRS eligibility. Those caps could hide Cards that FSRS had already decided were due, creating a second scheduling system above FSRS.

A student may disable scheduled review for weeks or months and later return. Re-enabling must not invent reviews, erase memory history, or pretend that no time passed.

## Decision

- `fsrsEnabled` is a first-class plugin setting and defaults to `true`. It controls whether Today’s Focus is shown, not whether the FSRS memory engine can record manual reviews.
- When enabled, FSRS is the only time-based eligibility authority. Every valid due or new Card is available in Today’s Focus, grouped and ordered by Concept. Mneme does not apply daily Concept, daily Card, or per-Concept Card caps.
- Review Tomorrow, Suspend Card, Archive Card, deletion, invalid Card handling, missing stable IDs, and exploratory Concept rules remain explicit Card-level non-scheduling exclusions. ADR 0017 removes Concept pause as an active review control.
- When disabled, Mneme shows no Today’s Focus queue and accepts no scheduled-review ratings from Mneme Review. Concept Library browsing, Concept editing, Card creation, and manual Concept-scoped Card review remain available.
- Manual Concept Review uses all valid Cards in that Concept, including non-due Cards, and `Again`, `Hard`, `Good`, and `Easy` still update FSRS memory state.
- Disabling Scheduled Review does not itself mutate Card review state, due dates, review events, deferrals, suspensions, retirements, or Concept state.
- Ordinary reading or editing while FSRS is disabled is not recorded as an FSRS review.
- Cards created while Scheduled Review is disabled remain new until the student manually reviews them from Concept Library or turns Today’s Focus back on and rates them there.
- Re-enabling Today’s Focus continues each existing Card from its real FSRS state. Due dates are not shifted and elapsed time is not frozen. Cards whose stored `dueAt` is in the past become eligible immediately; the next rating is passed to `ts-fsrs` with the real review time.

## Consequences

- A long break may produce many eligible Cards on return. Mneme presents them calmly and preserves Concept priority ordering, but does not conceal them behind a second quota.
- A student who wants less work should use FSRS retention settings or explicit Card controls rather than a competing daily scheduler.
- Legacy persisted daily limit keys are no longer part of `MnemeSettings` and are omitted the next time settings are saved.
- “Today’s Focus” describes presentation and grouping, not a bounded daily assignment.
